import { ProgressStatus, Role } from '@lms/database';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

interface Actor {
  id: string;
  role: Role;
}

// =====================================================
// Response shapes
// =====================================================

export interface StudentCourseRow {
  courseId: string;
  title: string;
  thumbnailUrl: string | null;
  progressPercent: number;
  avgScore: number | null;
  completedLessons: number;
  totalLessons: number;
  lastActiveAt: Date;
  enrolledAt: Date;
  completedAt: Date | null;
}

export interface StudentLessonRow {
  id: string;
  title: string;
  type: 'THEORY' | 'PRACTICE';
  status: ProgressStatus;
  score: number | null;
  completedAt: Date | null;
  timeSpent: number;
}

export interface StudentCourseDetail {
  courseId: string;
  courseTitle: string;
  studentId: string;
  progressPercent: number;
  lessons: StudentLessonRow[];
}

export interface CourseStudentRow {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  progressPercent: number;
  avgScore: number | null;
  isAtRisk: boolean;
  atRiskReasons: string[];
  lastActiveAt: Date;
  enrolledAt: Date;
}

/**
 * Phase 15 — Progress Tracking core service.
 *
 * Two responsibilities:
 *
 * 1. **Calculation engine** — `calculateCourseProgress` reads every
 *    LessonProgress row for a (student, course) pair, rolls it up into
 *    `CourseEnrollment.progressPercent` + `completedAt` + `lastActiveAt`.
 *    Called by the three mutation paths that can move a lesson toward
 *    completion (lesson-complete, quiz-pass, practice-pass) so the rollup
 *    never drifts from the underlying LessonProgress rows.
 *
 * 2. **Read API** — the endpoints under /progress/* that the dashboards
 *    consume. Ownership is enforced here, not in the controller:
 *      - STUDENT can only read their own data
 *      - INSTRUCTOR can read students enrolled in courses they own
 *      - ADMIN+ unrestricted
 */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // Calculation engine
  // =====================================================
  /**
   * Recompute CourseEnrollment rollup for (studentId, courseId).
   *
   * Pure-SQL approach: one COUNT for total, one COUNT for completed, one
   * AVG for score, one UPDATE. We intentionally skip the optimistic
   * "only update if changed" check — the write is cheap and avoids a
   * second round-trip.
   *
   * If the enrollment doesn't exist (student isn't enrolled but somehow
   * has LessonProgress rows — rare, via admin manipulation) we no-op.
   */
  async calculateCourseProgress(
    studentId: string,
    courseId: string,
  ): Promise<{ progressPercent: number; completed: boolean }> {
    const enrollment = await this.prisma.client.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
      select: { id: true, completedAt: true },
    });
    if (!enrollment) {
      return { progressPercent: 0, completed: false };
    }

    // Lessons in this course (exclude soft-deleted)
    const chapters = await this.prisma.client.chapter.findMany({
      where: { courseId },
      select: { id: true },
    });
    const chapterIds = chapters.map((c) => c.id);
    if (chapterIds.length === 0) {
      await this.prisma.client.courseEnrollment.update({
        where: { id: enrollment.id },
        data: { progressPercent: 0, lastActiveAt: new Date() },
      });
      return { progressPercent: 0, completed: false };
    }

    const lessons = await this.prisma.client.lesson.findMany({
      where: { chapterId: { in: chapterIds }, isDeleted: false },
      select: { id: true },
    });
    const lessonIds = lessons.map((l) => l.id);
    const totalLessons = lessonIds.length;

    if (totalLessons === 0) {
      await this.prisma.client.courseEnrollment.update({
        where: { id: enrollment.id },
        data: { progressPercent: 0, lastActiveAt: new Date() },
      });
      return { progressPercent: 0, completed: false };
    }

    const progressRows = await this.prisma.client.lessonProgress.findMany({
      where: { studentId, lessonId: { in: lessonIds } },
      select: { status: true, score: true },
    });
    const completedLessons = progressRows.filter(
      (p) => p.status === ProgressStatus.COMPLETED,
    ).length;
    const progressPercent = Math.round((completedLessons / totalLessons) * 100);

    const isNowComplete = progressPercent === 100;
    const shouldStampCompletion = isNowComplete && !enrollment.completedAt;

    await this.prisma.client.courseEnrollment.update({
      where: { id: enrollment.id },
      data: {
        progressPercent,
        lastActiveAt: new Date(),
        ...(shouldStampCompletion ? { completedAt: new Date() } : {}),
      },
    });

    return { progressPercent, completed: isNowComplete };
  }

  /**
   * Touch `lastActiveAt` without recalculating — used when the student
   * opens a lesson (GET /lessons/:id) but hasn't completed anything yet.
   * Kept separate from `calculateCourseProgress` so simple view events
   * don't trigger the heavy aggregation pass.
   */
  async touchLastActive(studentId: string, courseId: string): Promise<void> {
    await this.prisma.client.courseEnrollment.updateMany({
      where: { courseId, studentId },
      data: { lastActiveAt: new Date() },
    });
  }

  // =====================================================
  // GET /progress/student/:id/courses
  // =====================================================
  async getStudentCourses(actor: Actor, studentId: string): Promise<StudentCourseRow[]> {
    await this.assertStudentReadable(actor, studentId);

    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: { studentId, course: { isDeleted: false } },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            chapters: {
              select: {
                lessons: {
                  where: { isDeleted: false },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    const rows: StudentCourseRow[] = [];
    for (const e of enrollments) {
      const lessonIds = e.course.chapters.flatMap((c) => c.lessons.map((l) => l.id));
      const progresses =
        lessonIds.length === 0
          ? []
          : await this.prisma.client.lessonProgress.findMany({
              where: { studentId, lessonId: { in: lessonIds } },
              select: { status: true, score: true },
            });
      const completed = progresses.filter((p) => p.status === ProgressStatus.COMPLETED).length;
      const scored = progresses.filter((p) => p.score !== null);
      const avgScore =
        scored.length > 0
          ? Math.round(scored.reduce((s, p) => s + (p.score ?? 0), 0) / scored.length)
          : null;

      rows.push({
        courseId: e.course.id,
        title: e.course.title,
        thumbnailUrl: e.course.thumbnailUrl,
        progressPercent: e.progressPercent,
        avgScore,
        completedLessons: completed,
        totalLessons: lessonIds.length,
        lastActiveAt: e.lastActiveAt,
        enrolledAt: e.enrolledAt,
        completedAt: e.completedAt,
      });
    }

    return rows;
  }

  // =====================================================
  // GET /progress/student/:id/course/:cid
  // =====================================================
  async getStudentCourse(
    actor: Actor,
    studentId: string,
    courseId: string,
  ): Promise<StudentCourseDetail> {
    await this.assertStudentReadable(actor, studentId);

    const course = await this.prisma.client.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        isDeleted: true,
        chapters: {
          orderBy: { order: 'asc' },
          select: {
            lessons: {
              where: { isDeleted: false },
              orderBy: { order: 'asc' },
              select: { id: true, title: true, type: true },
            },
          },
        },
      },
    });
    if (!course || course.isDeleted) throw new NotFoundException('Không tìm thấy khoá học');

    const enrollment = await this.prisma.client.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
      select: { progressPercent: true },
    });

    const flatLessons = course.chapters.flatMap((c) => c.lessons);
    const lessonIds = flatLessons.map((l) => l.id);
    const progresses =
      lessonIds.length === 0
        ? []
        : await this.prisma.client.lessonProgress.findMany({
            where: { studentId, lessonId: { in: lessonIds } },
          });
    const byLesson = new Map(progresses.map((p) => [p.lessonId, p]));

    const lessons: StudentLessonRow[] = flatLessons.map((l) => {
      const p = byLesson.get(l.id);
      return {
        id: l.id,
        title: l.title,
        type: l.type as 'THEORY' | 'PRACTICE',
        status: p?.status ?? ProgressStatus.NOT_STARTED,
        score: p?.score ?? null,
        completedAt: p?.completedAt ?? null,
        timeSpent: p?.timeSpent ?? 0,
      };
    });

    return {
      courseId: course.id,
      courseTitle: course.title,
      studentId,
      progressPercent: enrollment?.progressPercent ?? 0,
      lessons,
    };
  }

  // =====================================================
  // GET /progress/course/:id/students
  // =====================================================
  async getCourseStudents(actor: Actor, courseId: string): Promise<CourseStudentRow[]> {
    await this.assertCourseReadable(actor, courseId);

    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: { courseId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        student: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const rows: CourseStudentRow[] = [];

    for (const e of enrollments) {
      const avgAgg = await this.prisma.client.lessonProgress.aggregate({
        where: {
          studentId: e.studentId,
          score: { not: null },
          lesson: { chapter: { courseId } },
        },
        _avg: { score: true },
      });
      const avgScore = avgAgg._avg.score !== null ? Math.round(avgAgg._avg.score) : null;

      // At-risk inline detection (detailed logic lives in AtRiskService —
      // duplicated here to avoid a circular dependency; the two
      // implementations share constants via the Phase 15 spec).
      const reasons: string[] = [];
      const daysSinceEnrolled = (now - e.enrolledAt.getTime()) / DAY;
      if (daysSinceEnrolled >= 7 && e.progressPercent < 30) {
        reasons.push(`Tiến độ ${e.progressPercent}% sau ${Math.floor(daysSinceEnrolled)} ngày`);
      }
      const daysInactive = (now - e.lastActiveAt.getTime()) / DAY;
      if (daysInactive > 5) {
        reasons.push(`Không hoạt động ${Math.floor(daysInactive)} ngày`);
      }
      if (avgScore !== null && avgScore < 50) {
        reasons.push(`Điểm TB ${avgScore}%`);
      }

      rows.push({
        id: e.student.id,
        name: e.student.name,
        email: e.student.email,
        avatar: e.student.avatar,
        progressPercent: e.progressPercent,
        avgScore,
        isAtRisk: reasons.length > 0,
        atRiskReasons: reasons,
        lastActiveAt: e.lastActiveAt,
        enrolledAt: e.enrolledAt,
      });
    }

    return rows;
  }

  // =====================================================
  // Authz helpers
  // =====================================================
  private async assertStudentReadable(actor: Actor, studentId: string): Promise<void> {
    // STUDENT → only self
    if (actor.role === Role.STUDENT) {
      if (actor.id !== studentId) {
        throw new ForbiddenException('Không thể xem tiến độ của học viên khác');
      }
      return;
    }
    // ADMIN+ → unrestricted
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;

    // INSTRUCTOR → must co-share a course with the student
    if (actor.role === Role.INSTRUCTOR) {
      const shared = await this.prisma.client.courseEnrollment.findFirst({
        where: { studentId, course: { instructorId: actor.id, isDeleted: false } },
        select: { id: true },
      });
      if (!shared) {
        throw new ForbiddenException('Học viên không thuộc khoá học bạn giảng dạy');
      }
      return;
    }
    throw new ForbiddenException('Không có quyền');
  }

  private async assertCourseReadable(actor: Actor, courseId: string): Promise<void> {
    if (actor.role === Role.ADMIN || actor.role === Role.SUPER_ADMIN) return;
    if (actor.role === Role.INSTRUCTOR) {
      const course = await this.prisma.client.course.findUnique({
        where: { id: courseId },
        select: { instructorId: true, isDeleted: true },
      });
      if (!course || course.isDeleted) throw new NotFoundException('Không tìm thấy khoá học');
      if (course.instructorId !== actor.id) {
        throw new ForbiddenException('Bạn không giảng dạy khoá học này');
      }
      return;
    }
    throw new ForbiddenException('Không có quyền');
  }
}
