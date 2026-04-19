import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateDepartmentDto } from './dto/create-department.dto';
import type { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeInactive = false) {
    return this.prisma.client.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        // Chỉ đếm môn học active (isDeleted=false) — các môn đã xoá mềm
        // không hiện trong tree curriculum nên không cần tính vào badge.
        _count: { select: { subjects: { where: { isDeleted: false } } } },
      },
    });
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
    return this.prisma.client.department.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    return this.prisma.client.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string) {
    // Đếm toàn bộ subjects (cả active + soft-deleted). Subject soft-delete
    // vẫn tham chiếu FK department.id nên phải được giải quyết trước khi
    // hard-delete department; Prisma sẽ ném P2003 nếu còn bất kỳ hàng con.
    //
    // Không cascade trong code vì Subject còn kéo theo Course → Chapter →
    // Lesson → Quiz/Attempt/Certificate/... — chuỗi FK quá dài để xoá
    // thủ công an toàn. Nếu business cần hard delete tận gốc, sẽ chuyển
    // sang soft-delete Department (migration + filter) ở phase sau.
    const dept = await this.prisma.client.department.findUnique({
      where: { id },
      include: {
        subjects: { select: { id: true, name: true, isDeleted: true } },
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

    if (softDeleted.length > 0) {
      throw new BadRequestException(
        `Không thể xoá — ngành còn ${softDeleted.length} môn đã xoá mềm nhưng chưa dọn dữ liệu con (khoá học cũ). ` +
          `Xử lý qua Prisma Studio hoặc script dọn dẹp trước khi xoá ngành.`,
      );
    }

    await this.prisma.client.department.delete({ where: { id } });
    return { message: 'Đã xoá ngành học' };
  }
}
