import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { CreateSubjectDto } from './dto/create-subject.dto';
import type { UpdateSubjectDto } from './dto/update-subject.dto';

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(departmentId?: string) {
    return this.prisma.client.subject.findMany({
      where: departmentId ? { departmentId } : {},
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { courses: true } },
      },
    });
  }

  async findOne(id: string) {
    const subject = await this.prisma.client.subject.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { courses: true } },
      },
    });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học');
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
    return this.prisma.client.subject.create({
      data: {
        departmentId: dto.departmentId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        order: dto.order ?? 0,
      },
    });
  }

  async update(id: string, dto: UpdateSubjectDto) {
    await this.findOne(id);
    return this.prisma.client.subject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.thumbnailUrl !== undefined && { thumbnailUrl: dto.thumbnailUrl }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });
  }
}
