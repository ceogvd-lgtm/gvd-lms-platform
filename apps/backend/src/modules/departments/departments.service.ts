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
        _count: { select: { subjects: true } },
      },
    });
  }

  async findOne(id: string) {
    const dept = await this.prisma.client.department.findUnique({
      where: { id },
      include: { _count: { select: { subjects: true } } },
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
    const dept = await this.prisma.client.department.findUnique({
      where: { id },
      include: { _count: { select: { subjects: true } } },
    });
    if (!dept) throw new NotFoundException('Không tìm thấy ngành học');

    if (dept._count.subjects > 0) {
      throw new BadRequestException(
        `Không thể xoá — ngành này còn ${dept._count.subjects} môn học. Xoá hết môn trước.`,
      );
    }
    await this.prisma.client.department.delete({ where: { id } });
    return { message: 'Đã xoá ngành học' };
  }
}
