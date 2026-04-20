import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CACHE_TTL, CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateDepartmentDto } from './dto/create-department.dto';
import type { UpdateDepartmentDto } from './dto/update-department.dto';

// Phase 18 — department list is read hundreds of times per navigation
// (sidebar tree, course filter, signup form) and rotates on the order
// of once a month. Worth the one-hour cache.
const NS = 'departments';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(includeInactive = false) {
    const cacheKey = `list:active=${!includeInactive}`;
    return this.cache.getOrSet(NS, cacheKey, CACHE_TTL.ONE_HOUR, () =>
      this.prisma.client.department.findMany({
        where: includeInactive ? {} : { isActive: true },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: {
          _count: { select: { subjects: { where: { isDeleted: false } } } },
        },
      }),
    );
  }

  async findOne(id: string) {
    const dept = await this.prisma.client.department.findUnique({
      where: { id },
      include: {
        _count: { select: { subjects: { where: { isDeleted: false } } } },
      },
    });
    if (!dept) throw new NotFoundException('Không tìm thấy ngành học');
    return dept;
  }

  async create(dto: CreateDepartmentDto) {
    const existing = await this.prisma.client.department.findUnique({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Code "${dto.code}" đã được sử dụng`);
    }
    const created = await this.prisma.client.department.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.cache.invalidateNamespace(NS);
    return created;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    const updated = await this.prisma.client.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    await this.cache.invalidateNamespace(NS);
    return updated;
  }

  async remove(id: string) {
    // Phase 18 — cascade-clean soft-deleted tree khi xoá ngành.
    //
    // Chuỗi FK: Department → Subject → Course → Chapter → Lesson → Quiz → …
    // Soft-delete ở UI chỉ set `isDeleted=true` — row con vẫn ở DB, Prisma
    // P2003 chặn hard-delete Department. Trước đây service throw 400 bắt
    // user dọn tay qua Prisma Studio → kẹt data khó chịu.
    //
    // Giờ: nếu ngành CHỈ còn subject đã soft-delete + mọi course cũng đã
    // soft-delete + KHÔNG có certificate đã phát (Certificate FK không
    // cascade), tự cascade hard-delete toàn bộ cây trong 1 transaction.
    // Còn active hoặc có certificate → vẫn reject kèm thông báo rõ ràng.
    const dept = await this.prisma.client.department.findUnique({
      where: { id },
      include: {
        subjects: {
          select: {
            id: true,
            name: true,
            isDeleted: true,
            courses: {
              select: {
                id: true,
                title: true,
                isDeleted: true,
                _count: { select: { certificates: true } },
              },
            },
          },
        },
      },
    });
    if (!dept) throw new NotFoundException('Không tìm thấy ngành học');

    const active = dept.subjects.filter((s) => !s.isDeleted);
    const softDeleted = dept.subjects.filter((s) => s.isDeleted);

    if (active.length > 0) {
      throw new BadRequestException(
        `Không thể xoá — còn ${active.length} môn học chưa xoá. Xoá hết môn trước.`,
      );
    }

    // Với mỗi soft-deleted subject, kiểm tra các course bên trong:
    //   - activeCourses: course.isDeleted=false → block (user chưa hoàn
    //     tất xoá, không được cascade)
    //   - certificatesIssued: Certificate FK không cascade → phải bảo
    //     toàn chứng chỉ đã phát, block hard-delete
    if (softDeleted.length > 0) {
      const activeCourses: Array<{ subject: string; course: string }> = [];
      const courseWithCerts: Array<{ subject: string; course: string; count: number }> = [];
      for (const s of softDeleted) {
        for (const c of s.courses) {
          if (!c.isDeleted) activeCourses.push({ subject: s.name, course: c.title });
          if (c._count.certificates > 0) {
            courseWithCerts.push({
              subject: s.name,
              course: c.title,
              count: c._count.certificates,
            });
          }
        }
      }

      if (activeCourses.length > 0) {
        const sample = activeCourses
          .slice(0, 3)
          .map((a) => `"${a.course}" (môn ${a.subject})`)
          .join(', ');
        throw new BadRequestException(
          `Không thể xoá — còn ${activeCourses.length} khoá học hoạt động trong các môn đã xoá mềm: ${sample}${activeCourses.length > 3 ? '…' : ''}. Lưu trữ / xoá hết khoá học trước.`,
        );
      }
      if (courseWithCerts.length > 0) {
        const total = courseWithCerts.reduce((sum, c) => sum + c.count, 0);
        throw new BadRequestException(
          `Không thể xoá — ngành còn ${total} chứng chỉ đã phát thuộc ${courseWithCerts.length} khoá học cũ. Không xoá để bảo toàn lịch sử chứng chỉ.`,
        );
      }

      // Safe to cascade: gom id courses + subjects, xoá trong 1 transaction.
      // Course cascade: Chapter/Lesson/Quiz/QuizQuestion/QuizAttempt/
      // Enrollment/CertificateCriteria sẽ tự xoá theo schema onDelete: Cascade.
      // QuestionBank.courseId sẽ được set null (SetNull).
      const subjectIds = softDeleted.map((s) => s.id);
      const courseIds = softDeleted.flatMap((s) => s.courses.map((c) => c.id));

      await this.prisma.client.$transaction(async (tx) => {
        if (courseIds.length > 0) {
          await tx.course.deleteMany({ where: { id: { in: courseIds } } });
        }
        await tx.subject.deleteMany({ where: { id: { in: subjectIds } } });
      });
    }

    await this.prisma.client.department.delete({ where: { id } });
    await this.cache.invalidateNamespace(NS);
    return {
      message: 'Đã xoá ngành học',
      cascaded: {
        subjects: softDeleted.length,
        courses: softDeleted.reduce((sum, s) => sum + s.courses.length, 0),
      },
    };
  }
}
