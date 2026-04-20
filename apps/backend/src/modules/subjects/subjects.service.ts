import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { CACHE_TTL, CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { extractMinioKey } from '../../common/storage/storage.utils';

import type { CreateSubjectDto } from './dto/create-subject.dto';
import type { UpdateSubjectDto } from './dto/update-subject.dto';

const NS = 'subjects';

@Injectable()
export class SubjectsService {
  private readonly logger = new Logger(SubjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly cache: CacheService,
  ) {}

  // _count chỉ đếm courses đang hoạt động (isDeleted=false) để UI hiển thị
  // số khoá thực tế, không kể các khoá đã soft-delete.
  private readonly countActiveCourses = {
    select: { courses: { where: { isDeleted: false } } },
  } as const;

  async list(departmentId?: string) {
    const cacheKey = `list:dept=${departmentId ?? 'all'}`;
    return this.cache.getOrSet(NS, cacheKey, CACHE_TTL.ONE_HOUR, () =>
      this.prisma.client.subject.findMany({
        where: {
          isDeleted: false,
          ...(departmentId ? { departmentId } : {}),
        },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: {
          department: { select: { id: true, name: true, code: true } },
          _count: this.countActiveCourses,
        },
      }),
    );
  }

  async findOne(id: string) {
    const subject = await this.prisma.client.subject.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: this.countActiveCourses,
      },
    });
    if (!subject || subject.isDeleted) throw new NotFoundException('Không tìm thấy môn học');
    return subject;
  }

  async create(dto: CreateSubjectDto) {
    const dept = await this.prisma.client.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!dept) throw new NotFoundException('Ngành học không tồn tại');

    const existing = await this.prisma.client.subject.findUnique({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Code "${dto.code}" đã được sử dụng`);
    }
    const created = await this.prisma.client.subject.create({
      data: {
        departmentId: dto.departmentId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        order: dto.order ?? 0,
      },
    });
    await this.cache.invalidateNamespace(NS);
    return created;
  }

  async update(id: string, dto: UpdateSubjectDto) {
    await this.findOne(id);
    const updated = await this.prisma.client.subject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });
    await this.cache.invalidateNamespace(NS);
    return updated;
  }

  /**
   * Soft delete — set `isDeleted=true`. Không hard delete để giữ lịch sử
   * + foreign key integrity với các Course đã soft-delete trước đó.
   *
   * Reject nếu còn Course đang hoạt động (isDeleted=false). Admin phải
   * xoá/lưu trữ hết khoá active trước khi xoá môn.
   *
   * Ghi AuditLog để có thể truy vết. Khôi phục bằng cách set `isDeleted=false`
   * qua Prisma Studio hoặc endpoint restore (future phase).
   */
  async remove(id: string, actor: { id: string; ip: string }): Promise<{ message: string }> {
    const subject = await this.prisma.client.subject.findUnique({
      where: { id },
      include: {
        _count: { select: { courses: { where: { isDeleted: false } } } },
      },
    });
    if (!subject || subject.isDeleted) {
      throw new NotFoundException('Không tìm thấy môn học');
    }

    if (subject._count.courses > 0) {
      throw new BadRequestException(
        `Không thể xoá — môn học còn ${subject._count.courses} khoá học. Xoá hoặc lưu trữ hết khoá trước.`,
      );
    }

    await this.prisma.client.subject.update({
      where: { id },
      data: { isDeleted: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'SUBJECT_DELETED',
      targetType: 'Subject',
      targetId: id,
      ipAddress: actor.ip,
      oldValue: { name: subject.name, code: subject.code },
    });

    // Option A — xoá thumbnail mồ côi khỏi MinIO. Không throw dù fail để
    // đảm bảo flow xoá entity luôn hoàn tất; orphan file (nếu có) sẽ
    // được cron weekly (Option B) quét và dọn.
    await this.cleanupFile(subject.thumbnailUrl, `subject ${id} thumbnail`);
    await this.cache.invalidateNamespace(NS);

    return { message: 'Đã xoá môn học' };
  }

  private async cleanupFile(url: string | null | undefined, label: string): Promise<void> {
    const key = extractMinioKey(url);
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(
        `Storage cleanup failed for ${label} (key=${key}): ${(err as Error).message}`,
      );
    }
  }
}
