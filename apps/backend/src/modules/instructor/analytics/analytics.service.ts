import { ProgressStatus, Role } from '@lms/database';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailService } from '../../notifications/email.service';

import { ExportStudentsDto, ListStudentsDto } from './dto/list-students.dto';
import { SendReminderDto } from './dto/send-reminder.dto';

interface Actor {
  id: string;
  role: Role;
}

interface Meta {
  ip: string;
}

const AT_RISK_PROGRESS_THRESHOLD = 30;
const AT_RISK_INACTIVE_DAYS = 7;

export interface StudentRow {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
  courseId: string;
  courseTitle: string;
  enrolledAt: Date;
  completedAt: Date | null;
  progressPercent: number;
  avgScore: number | null;
  lastActiveAt: Date | null;
  status: 'at-risk' | 'in-progress' | 'completed' | 'not-started';
}

/**
 * Analytics for instructors (Phase 10).
 *
 * Same scope rule as InstructorDashboardService — every query MUST be
 * limited to courses where `instructorId === actor.id`. ADMIN+ also
 * uses these endpoints but only sees their own data; cross-instructor
 * analytics live under /admin/reports.
 */
@Injectable()
export class InstructorAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  // =====================================================
  // LIST students (paginated)
  // =====================================================
  async listStudents(actor: Actor, dto: ListStudentsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const ownedCourseIds = await this.getOwnedCourseIds(actor);
    if (ownedCourseIds.length === 0) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const courseFilter = dto.courseId
      ? ownedCourseIds.includes(dto.courseId)
        ? [dto.courseId]
        : []
      : ownedCourseIds;

    if (courseFilter.length === 0) {
      // Instructor asked for a course they don't own.
      throw new ForbiddenException('Bạn không có quyền xem khoá học này');
    }

    // Fetch all enrollments matching scope, then compute progress per row.
    // We post-filter by status because the status depends on aggregate data
    // we can't easily express in a Prisma where clause.
    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: {
        courseId: { in: courseFilter },
        ...(dto.q
          ? {
              student: {
                OR: [
                  { name: { contains: dto.q, mode: 'insensitive' } },
                  { email: { contains: dto.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      orderBy: { enrolledAt: 'desc' },
      include: {
        student: { select: { id: true, name: true, email: true, avatar: true } },
        course: { select: { id: true, title: true } },
      },
    });

    const allRows = await Promise.all(enrollments.map((e) => this.buildStudentRow(e)));

    const filtered =
      dto.filter && dto.filter !== 'all' ? allRows.filter((r) => r.status === dto.filter) : allRows;

    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =====================================================
  // STUDENT DETAIL — per-lesson breakdown
  // =====================================================
  async getStudentDetail(actor: Actor, studentId: string, courseId: string) {
    const ownedCourseIds = await this.getOwnedCourseIds(actor);
    if (!ownedCourseIds.includes(courseId)) {
      throw new ForbiddenException('Bạn không có quyền xem khoá học này');
    }

    const [enrollment, lessons] = await Promise.all([
      this.prisma.client.courseEnrollment.findFirst({
        where: { studentId, courseId },
        include: {
          student: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.client.lesson.findMany({
        where: { chapter: { courseId }, isDeleted: false },
        orderBy: [{ chapterId: 'asc' }, { order: 'asc' }],
        select: {
          id: true,
          title: true,
          type: true,
          chapter: { select: { id: true, title: true, order: true } },
        },
      }),
    ]);

    if (!enrollment) {
      throw new NotFoundException('Học viên chưa đăng ký khoá học này');
    }

    const progressRows = await this.prisma.client.lessonProgress.findMany({
      where: { studentId, lessonId: { in: lessons.map((l) => l.id) } },
    });

    const progressByLesson = new Map(progressRows.map((p) => [p.lessonId, p]));
    const lessonDetails = lessons.map((l) => {
      const p = progressByLesson.get(l.id);
      return {
        lessonId: l.id,
        lessonTitle: l.title,
        lessonType: l.type,
        chapterTitle: l.chapter.title,
        chapterOrder: l.chapter.order,
        status: p?.status ?? ProgressStatus.NOT_STARTED,
        score: p?.score ?? null,
        timeSpentSec: p?.timeSpent ?? 0,
        attempts: p?.attempts ?? 0,
        completedAt: p?.completedAt ?? null,
      };
    });

    return {
      enrollment: {
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
      },
      student: enrollment.student,
      course: enrollment.course,
      lessons: lessonDetails,
    };
  }

  // =====================================================
  // EXPORT CSV — same filter as listStudents but unpaginated
  // =====================================================
  async exportCsv(
    actor: Actor,
    dto: ExportStudentsDto,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    // Reuse listStudents to keep filter parity; cap to 1000 to be safe.
    const { data } = await this.listStudents(actor, {
      ...dto,
      page: 1,
      limit: 1000,
    });

    const header = [
      'ID',
      'Họ tên',
      'Email',
      'Khoá học',
      'Tiến độ %',
      'Điểm TB',
      'Trạng thái',
      'Đăng ký',
      'Hoàn thành',
      'Hoạt động cuối',
    ];
    const rows = data.map((r) => [
      r.studentId,
      r.studentName,
      r.studentEmail,
      r.courseTitle,
      String(r.progressPercent),
      r.avgScore !== null ? String(r.avgScore) : '',
      r.status,
      r.enrolledAt.toISOString(),
      r.completedAt ? r.completedAt.toISOString() : '',
      r.lastActiveAt ? r.lastActiveAt.toISOString() : '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvEscape(cell)).join(','))
      .join('\r\n');

    const buffer = Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(csv, 'utf8')]);
    const timestamp = new Date().toISOString().split('T')[0];

    return {
      buffer,
      contentType: 'text/csv; charset=utf-8',
      filename: `students-${timestamp}.csv`,
    };
  }

  // =====================================================
  // SEND REMINDER — enqueue at-risk-alert email per student
  // =====================================================
  async sendReminder(actor: Actor, dto: SendReminderDto, meta: Meta) {
    const ownedCourseIds = await this.getOwnedCourseIds(actor);
    if (!ownedCourseIds.includes(dto.courseId)) {
      throw new ForbiddenException('Bạn không có quyền với khoá học này');
    }

    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: {
        courseId: dto.courseId,
        studentId: { in: dto.studentIds },
      },
      include: {
        student: { select: { id: true, name: true, email: true } },
        course: { select: { title: true, id: true } },
      },
    });

    const sent: string[] = [];
    const failed: Array<{ studentId: string; reason: string }> = [];
    const now = Date.now();

    for (const e of enrollments) {
      try {
        // Compute days inactive — fall back to days since enrollment if no
        // activity ever recorded.
        const lastActive = await this.prisma.client.lessonProgress.findFirst({
          where: {
            studentId: e.studentId,
            lesson: { chapter: { courseId: dto.courseId } },
          },
          orderBy: { lastViewAt: 'desc' },
          select: { lastViewAt: true },
        });
        const daysInactive = Math.floor(
          (now - (lastActive?.lastViewAt ?? e.enrolledAt).getTime()) / (24 * 60 * 60 * 1000),
        );

        // Compute current progress percent (cheap: lessons in course vs completed).
        const [totalLessons, completedLessons] = await Promise.all([
          this.prisma.client.lesson.count({
            where: { chapter: { courseId: dto.courseId }, isDeleted: false },
          }),
          this.prisma.client.lessonProgress.count({
            where: {
              studentId: e.studentId,
              status: ProgressStatus.COMPLETED,
              lesson: { chapter: { courseId: dto.courseId }, isDeleted: false },
            },
          }),
        ]);
        const currentProgress =
          totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

        await this.email.sendAtRiskAlert(e.student.email, {
          name: e.student.name,
          daysInactive,
          currentProgress,
          resumeUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/courses/${e.course.id}`,
        });
        sent.push(e.student.id);
      } catch (err) {
        failed.push({
          studentId: e.student.id,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    await this.audit.log({
      userId: actor.id,
      action: 'INSTRUCTOR_SEND_REMINDER',
      targetType: 'Course',
      targetId: dto.courseId,
      ipAddress: meta.ip,
      newValue: { sent: sent.length, failed: failed.length, message: dto.message },
    });

    return { sent, failed, total: dto.studentIds.length };
  }

  // =====================================================
  // Internal helpers
  // =====================================================

  private async getOwnedCourseIds(actor: Actor): Promise<string[]> {
    const courses = await this.prisma.client.course.findMany({
      where: { instructorId: actor.id, isDeleted: false },
      select: { id: true },
    });
    return courses.map((c) => c.id);
  }

  private async buildStudentRow(enrollment: {
    id: string;
    studentId: string;
    courseId: string;
    enrolledAt: Date;
    completedAt: Date | null;
    student: { id: string; name: string; email: string; avatar: string | null };
    course: { id: string; title: string };
  }): Promise<StudentRow> {
    const [totalLessons, completedLessons, lastProgress, scoreAgg] = await Promise.all([
      this.prisma.client.lesson.count({
        where: { chapter: { courseId: enrollment.courseId }, isDeleted: false },
      }),
      this.prisma.client.lessonProgress.count({
        where: {
          studentId: enrollment.studentId,
          status: ProgressStatus.COMPLETED,
          lesson: { chapter: { courseId: enrollment.courseId }, isDeleted: false },
        },
      }),
      this.prisma.client.lessonProgress.findFirst({
        where: {
          studentId: enrollment.studentId,
          lesson: { chapter: { courseId: enrollment.courseId } },
        },
        orderBy: { lastViewAt: 'desc' },
        select: { lastViewAt: true },
      }),
      this.prisma.client.lessonProgress.aggregate({
        where: {
          studentId: enrollment.studentId,
          score: { not: null },
          lesson: { chapter: { courseId: enrollment.courseId } },
        },
        _avg: { score: true },
      }),
    ]);

    const progressPercent =
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const avgScore = scoreAgg._avg.score !== null ? Math.round(scoreAgg._avg.score) : null;
    const lastActiveAt = lastProgress?.lastViewAt ?? null;

    let status: StudentRow['status'];
    if (enrollment.completedAt) {
      status = 'completed';
    } else if (progressPercent === 0) {
      status = 'not-started';
    } else if (
      progressPercent < AT_RISK_PROGRESS_THRESHOLD &&
      lastActiveAt &&
      lastActiveAt.getTime() < Date.now() - AT_RISK_INACTIVE_DAYS * 24 * 60 * 60 * 1000
    ) {
      status = 'at-risk';
    } else {
      status = 'in-progress';
    }

    return {
      studentId: enrollment.student.id,
      studentName: enrollment.student.name,
      studentEmail: enrollment.student.email,
      studentAvatar: enrollment.student.avatar,
      courseId: enrollment.course.id,
      courseTitle: enrollment.course.title,
      enrolledAt: enrollment.enrolledAt,
      completedAt: enrollment.completedAt,
      progressPercent,
      avgScore,
      lastActiveAt,
      status,
    };
  }
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
