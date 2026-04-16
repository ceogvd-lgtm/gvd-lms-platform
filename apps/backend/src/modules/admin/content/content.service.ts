import { Role } from '@lms/database';
import { Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CoursesService } from '../../courses/courses.service';
import { LessonsService } from '../../lessons/lessons.service';

import { ListContentCoursesDto, ListContentLessonsDto } from './dto/list-content.dto';
import { RejectContentDto } from './dto/reject-content.dto';

interface Actor {
  id: string;
  role: Role;
}

interface Meta {
  ip: string;
}

/**
 * Admin content moderation — thin layer over existing CoursesService /
 * LessonsService. We never duplicate mutation logic; instead we delegate
 * so the course FSM, audit log, and soft-delete behaviour stay consistent
 * with Phase 08.
 *
 * Every mutation also writes a `CONTENT_*` audit action on top of the
 * action written by the underlying service, so /admin/audit-log can
 * filter moderation events specifically.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
    private readonly lessons: LessonsService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // LIST COURSES — reused CoursesService.list() with admin view
  // =====================================================
  async listCourses(actor: Actor, dto: ListContentCoursesDto) {
    return this.courses.list(actor, {
      q: dto.q,
      status: dto.status,
      subjectId: dto.subjectId,
      page: dto.page,
      limit: dto.limit,
      // Always exclude soft-deleted unless admin explicitly wants them;
      // admin-view listing never shows deleted by default.
      includeDeleted: 'false',
    });
  }

  // =====================================================
  // IMPACT — how many learners are affected by a course action
  // =====================================================
  async getCourseImpact(id: string) {
    const course = await this.prisma.client.course.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        isDeleted: true,
        _count: {
          select: {
            enrollments: true,
            chapters: true,
            certificates: true,
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khoá học');

    // Count active certificates (not revoked)
    const activeCertificates = await this.prisma.client.certificate.count({
      where: { courseId: id, status: 'ACTIVE' },
    });

    // Count lessons through chapters
    const lessonCount = await this.prisma.client.lesson.count({
      where: { chapter: { courseId: id }, isDeleted: false },
    });

    return {
      id: course.id,
      title: course.title,
      status: course.status,
      isDeleted: course.isDeleted,
      enrollmentCount: course._count.enrollments,
      chapterCount: course._count.chapters,
      lessonCount,
      totalCertificates: course._count.certificates,
      activeCertificates,
    };
  }

  // =====================================================
  // APPROVE — PENDING_REVIEW → PUBLISHED (delegates to CoursesService FSM)
  // =====================================================
  async approveCourse(actor: Actor, id: string, meta: Meta) {
    const result = await this.courses.updateStatus(actor, id, { action: 'APPROVE' }, meta);
    await this.audit.log({
      userId: actor.id,
      action: 'CONTENT_APPROVE',
      targetType: 'Course',
      targetId: id,
      ipAddress: meta.ip,
      newValue: { status: result.status },
    });
    return result;
  }

  // =====================================================
  // REJECT — PENDING_REVIEW → DRAFT with reason
  // =====================================================
  async rejectCourse(actor: Actor, id: string, dto: RejectContentDto, meta: Meta) {
    const result = await this.courses.updateStatus(
      actor,
      id,
      { action: 'REJECT', reason: dto.reason },
      meta,
    );
    await this.audit.log({
      userId: actor.id,
      action: 'CONTENT_REJECT',
      targetType: 'Course',
      targetId: id,
      ipAddress: meta.ip,
      newValue: { status: result.status, reason: dto.reason },
    });
    return result;
  }

  // =====================================================
  // DELETE — soft delete via CoursesService
  // =====================================================
  async deleteCourse(actor: Actor, id: string, meta: Meta) {
    const result = await this.courses.softDelete(actor, id, meta);
    await this.audit.log({
      userId: actor.id,
      action: 'CONTENT_DELETE',
      targetType: 'Course',
      targetId: id,
      ipAddress: meta.ip,
    });
    return result;
  }

  // =====================================================
  // LIST LESSONS — admin view with state filter
  // =====================================================
  async listLessons(dto: ListContentLessonsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};

    if (dto.courseId) {
      where.chapter = { courseId: dto.courseId };
    }
    if (dto.q) {
      where.title = { contains: dto.q, mode: 'insensitive' };
    }

    switch (dto.state) {
      case 'pending':
        where.isPublished = false;
        where.isDeleted = false;
        break;
      case 'published':
        where.isPublished = true;
        where.isDeleted = false;
        break;
      case 'deleted':
        where.isDeleted = true;
        break;
      case 'all':
      default:
        where.isDeleted = false;
    }

    const [total, data] = await Promise.all([
      this.prisma.client.lesson.count({ where }),
      this.prisma.client.lesson.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          chapter: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  instructor: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =====================================================
  // FLAG LESSON — audit-only flag for review
  // =====================================================
  async flagLesson(actor: Actor, id: string, reason: string, meta: Meta) {
    const lesson = await this.prisma.client.lesson.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');

    await this.audit.log({
      userId: actor.id,
      action: 'CONTENT_FLAG_LESSON',
      targetType: 'Lesson',
      targetId: id,
      ipAddress: meta.ip,
      newValue: { title: lesson.title, reason },
    });

    return { message: 'Đã gắn cờ bài giảng', id: lesson.id };
  }

  // =====================================================
  // DELETE LESSON — reuse LessonsService.softDelete (already enforces ADMIN+)
  // =====================================================
  async deleteLesson(actor: Actor, id: string, meta: Meta) {
    const result = await this.lessons.softDelete(actor, id, meta);
    await this.audit.log({
      userId: actor.id,
      action: 'CONTENT_DELETE_LESSON',
      targetType: 'Lesson',
      targetId: id,
      ipAddress: meta.ip,
    });
    return result;
  }
}
