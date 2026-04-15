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

  /**
   * Load a lesson plus its parent chapter + course so callers can check
   * ownership (instructor) in one query. Also returns a soft-delete aware
   * flag — we never return deleted lessons unless the caller is admin.
   */
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

  /**
   * Ownership check: INSTRUCTOR may only act on lessons belonging to a course
   * they own. ADMIN and SUPER_ADMIN bypass the check.
   */
  private assertOwnership(actor: Actor, courseInstructorId: string): void {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR && actor.id === courseInstructorId) return;
    throw new ForbiddenException('Bạn không có quyền với bài giảng này');
  }

  // =====================================================
  // CREATE
  // =====================================================
  async create(actor: Actor, dto: CreateLessonDto) {
    // Load chapter → course to verify ownership BEFORE creating.
    const chapter = await this.prisma.client.chapter.findUnique({
      where: { id: dto.chapterId },
      include: { course: { select: { instructorId: true } } },
    });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');

    this.assertOwnership(actor, chapter.course.instructorId);

    return this.prisma.client.lesson.create({
      data: {
        chapterId: dto.chapterId,
        title: dto.title,
        type: dto.type,
        order: dto.order ?? 0,
      },
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
  // DELETE  (ADMIN / SUPER_ADMIN ONLY — enforced BY CONTROLLER via @Roles)
  //
  // IMPORTANT: per CLAUDE.md INSTRUCTOR "TUYỆT ĐỐI KHÔNG CÓ NÚT XOÁ".
  // We soft-delete (isDeleted=true) and always log to AuditLog.
  // =====================================================
  async softDelete(actor: Actor, id: string, meta: RequestMeta) {
    // Double-check at service layer: even if an instructor somehow reached
    // this method, refuse. This is defense-in-depth — the controller already
    // blocks with @Roles(ADMIN, SUPER_ADMIN).
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
