import { Role } from '@lms/types';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

interface Actor {
  id: string;
  role: Role;
}

interface RequestMeta {
  ip: string;
}

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async findLessonWithCourse(id: string) {
    return this.prisma.client.lesson.findUnique({
      where: { id },
      include: {
        chapter: {
          include: {
            course: { select: { id: true, instructorId: true } },
          },
        },
      },
    });
  }

  private assertOwnership(actor: Actor, courseInstructorId: string): void {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === courseInstructorId) return;
    throw new ForbiddenException('Bạn không có quyền với bài giảng này');
  }

  // =====================================================
  // CREATE under a chapter (nested route)
  // =====================================================
  async createInChapter(actor: Actor, chapterId: string, dto: Omit<CreateLessonDto, 'chapterId'>) {
    const chapter = await this.prisma.client.chapter.findUnique({
      where: { id: chapterId },
      include: { course: { select: { instructorId: true } } },
    });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');
    this.assertOwnership(actor, chapter.course.instructorId);

    const last = await this.prisma.client.lesson.findFirst({
      where: { chapterId, isDeleted: false },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.client.lesson.create({
      data: {
        chapterId,
        title: dto.title,
        type: dto.type,
        order: (last?.order ?? -1) + 1,
      },
    });
  }

  // Backward-compat: flat POST /lessons still works (Phase 04 API).
  async create(actor: Actor, dto: CreateLessonDto) {
    return this.createInChapter(actor, dto.chapterId, {
      title: dto.title,
      type: dto.type,
      order: dto.order,
    });
  }

  // =====================================================
  // UPDATE
  // =====================================================
  async update(actor: Actor, id: string, dto: UpdateLessonDto) {
    const lesson = await this.findLessonWithCourse(id);
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }
    this.assertOwnership(actor, lesson.chapter.course.instructorId);

    return this.prisma.client.lesson.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
      },
    });
  }

  // =====================================================
  // REORDER lesson within its chapter
  // =====================================================
  async reorder(actor: Actor, id: string, newOrder: number) {
    const lesson = await this.findLessonWithCourse(id);
    if (!lesson || lesson.isDeleted) {
      throw new NotFoundException('Không tìm thấy bài giảng');
    }
    this.assertOwnership(actor, lesson.chapter.course.instructorId);

    const siblings = await this.prisma.client.lesson.findMany({
      where: { chapterId: lesson.chapterId, isDeleted: false },
      orderBy: { order: 'asc' },
      select: { id: true },
    });

    const without = siblings.filter((l) => l.id !== id);
    const clamped = Math.min(Math.max(0, newOrder), without.length);
    const next = [...without.slice(0, clamped), { id }, ...without.slice(clamped)];

    await this.prisma.client.$transaction(
      next.map((l, idx) =>
        this.prisma.client.lesson.update({
          where: { id: l.id },
          data: { order: idx },
        }),
      ),
    );

    return { message: 'Đã cập nhật thứ tự bài giảng', lessons: next };
  }

  // =====================================================
  // DELETE (soft, ADMIN+ only) — CLAUDE.md: INSTRUCTOR TUYỆT ĐỐI KHÔNG XOÁ
  // =====================================================
  async softDelete(actor: Actor, id: string, meta: RequestMeta) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền xoá bài giảng');
    }

    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id },
      select: { id: true, title: true, isDeleted: true, chapterId: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    if (lesson.isDeleted) {
      throw new NotFoundException('Bài giảng đã bị xoá');
    }

    const updated = await this.prisma.client.lesson.update({
      where: { id },
      data: { isDeleted: true },
      select: { id: true, title: true, isDeleted: true },
    });

    await this.audit.log({
      userId: actor.id,
      action: 'LESSON_DELETE',
      targetType: 'Lesson',
      targetId: id,
      ipAddress: meta.ip,
      oldValue: { title: lesson.title, isDeleted: false },
      newValue: { title: updated.title, isDeleted: true },
    });

    return { message: 'Đã xoá bài giảng', lesson: updated };
  }
}
