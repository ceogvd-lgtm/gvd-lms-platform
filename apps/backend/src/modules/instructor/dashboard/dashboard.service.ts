import { ProgressStatus } from '@lms/database';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/prisma/prisma.service';

interface Actor {
  id: string;
}

/**
 * Aggregation queries for /instructor/dashboard (Phase 10).
 *
 * Every method **must** scope to the instructor's own courses
 * (`course.instructorId = actor.id`). ADMIN+ also hits these endpoints
 * but only sees their own data — to view "all instructors" they go
 * through `/admin/dashboard` instead.
 */
@Injectable()
export class InstructorDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // STATS — 4 KPI numbers for the top row
  // =====================================================
  async getStats(actor: Actor) {
    // Build the courseId scope once and reuse it for every count.
    const ownedCourseIds = await this.getOwnedCourseIds(actor);

    if (ownedCourseIds.length === 0) {
      return { totalCourses: 0, activeStudents: 0, completionRate: 0, avgScore: 0 };
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalCourses, activeStudents, totalEnrollments, completedEnrollments, scoreAgg] =
      await Promise.all([
        ownedCourseIds.length,
        this.prisma.client.lessonProgress
          .findMany({
            where: {
              lastViewAt: { gte: sevenDaysAgo },
              lesson: { chapter: { courseId: { in: ownedCourseIds } } },
            },
            select: { studentId: true },
            distinct: ['studentId'],
          })
          .then((rows) => rows.length),
        this.prisma.client.courseEnrollment.count({
          where: { courseId: { in: ownedCourseIds } },
        }),
        this.prisma.client.courseEnrollment.count({
          where: { courseId: { in: ownedCourseIds }, completedAt: { not: null } },
        }),
        this.prisma.client.quizAttempt.aggregate({
          where: {
            quiz: { lesson: { chapter: { courseId: { in: ownedCourseIds } } } },
            completedAt: { not: null },
          },
          _avg: { score: true },
        }),
      ]);

    const completionRate =
      totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;
    const avgScore = scoreAgg._avg.score !== null ? Math.round(scoreAgg._avg.score) : 0;

    return { totalCourses, activeStudents, completionRate, avgScore };
  }

  // =====================================================
  // WEEKLY PROGRESS — line chart of completed lessons per ISO week
  // =====================================================
  async getWeeklyProgress(actor: Actor, weeks: number) {
    const clamped = Math.min(Math.max(1, Math.floor(weeks)), 26);
    const ownedCourseIds = await this.getOwnedCourseIds(actor);
    if (ownedCourseIds.length === 0) return { points: [] };

    const start = startOfWeek(new Date(), -1 * (clamped - 1));

    const completions = await this.prisma.client.lessonProgress.findMany({
      where: {
        status: ProgressStatus.COMPLETED,
        completedAt: { gte: start },
        lesson: { chapter: { courseId: { in: ownedCourseIds } } },
      },
      select: { completedAt: true },
    });

    // Bucket each completion into its week and count.
    const buckets = new Map<string, number>();
    for (let i = 0; i < clamped; i += 1) {
      const wkStart = startOfWeek(new Date(), -1 * (clamped - 1 - i));
      buckets.set(weekKey(wkStart), 0);
    }
    for (const c of completions) {
      if (!c.completedAt) continue;
      const key = weekKey(startOfWeek(c.completedAt, 0));
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return {
      points: Array.from(buckets.entries()).map(([week, count]) => ({ week, count })),
    };
  }

  // =====================================================
  // ACTIVITY FEED — enrollments + completions + quiz attempts
  // =====================================================
  async getActivity(actor: Actor, limit: number) {
    const clamped = Math.min(Math.max(1, Math.floor(limit)), 50);
    const ownedCourseIds = await this.getOwnedCourseIds(actor);
    if (ownedCourseIds.length === 0) return { items: [] };

    const [enrollments, completions, quizzes] = await Promise.all([
      this.prisma.client.courseEnrollment.findMany({
        where: { courseId: { in: ownedCourseIds } },
        orderBy: { enrolledAt: 'desc' },
        take: clamped,
        include: {
          student: { select: { id: true, name: true, avatar: true } },
          course: { select: { title: true } },
        },
      }),
      this.prisma.client.lessonProgress.findMany({
        where: {
          status: ProgressStatus.COMPLETED,
          completedAt: { not: null },
          lesson: { chapter: { courseId: { in: ownedCourseIds } } },
        },
        orderBy: { completedAt: 'desc' },
        take: clamped,
        include: {
          student: { select: { id: true, name: true, avatar: true } },
          lesson: {
            select: { title: true, chapter: { select: { course: { select: { title: true } } } } },
          },
        },
      }),
      this.prisma.client.quizAttempt.findMany({
        where: {
          completedAt: { not: null },
          quiz: { lesson: { chapter: { courseId: { in: ownedCourseIds } } } },
        },
        orderBy: { completedAt: 'desc' },
        take: clamped,
        include: {
          student: { select: { id: true, name: true, avatar: true } },
          quiz: { select: { title: true } },
        },
      }),
    ]);

    type Item = {
      id: string;
      type: 'ENROLL' | 'COMPLETE_LESSON' | 'QUIZ';
      studentId: string;
      studentName: string;
      studentAvatar: string | null;
      target: string;
      score: number | null;
      timestamp: Date;
    };

    const items: Item[] = [
      ...enrollments.map<Item>((e) => ({
        id: `enroll-${e.id}`,
        type: 'ENROLL',
        studentId: e.student.id,
        studentName: e.student.name,
        studentAvatar: e.student.avatar,
        target: e.course.title,
        score: null,
        timestamp: e.enrolledAt,
      })),
      ...completions.map<Item>((c) => ({
        id: `complete-${c.id}`,
        type: 'COMPLETE_LESSON',
        studentId: c.student.id,
        studentName: c.student.name,
        studentAvatar: c.student.avatar,
        target: `${c.lesson.chapter.course.title} → ${c.lesson.title}`,
        score: c.score,
        timestamp: c.completedAt!,
      })),
      ...quizzes.map<Item>((q) => ({
        id: `quiz-${q.id}`,
        type: 'QUIZ',
        studentId: q.student.id,
        studentName: q.student.name,
        studentAvatar: q.student.avatar,
        target: q.quiz.title,
        score: q.maxScore > 0 ? Math.round((q.score / q.maxScore) * 100) : null,
        timestamp: q.completedAt!,
      })),
    ];

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return { items: items.slice(0, clamped) };
  }

  // =====================================================
  // DEADLINES — students who enrolled > N days ago and haven't finished
  // =====================================================
  async getDeadlines(actor: Actor, days: number) {
    const clamped = Math.min(Math.max(1, Math.floor(days)), 30);
    const ownedCourseIds = await this.getOwnedCourseIds(actor);
    if (ownedCourseIds.length === 0) return { items: [] };

    const cutoff = new Date(Date.now() - clamped * 24 * 60 * 60 * 1000);

    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: {
        courseId: { in: ownedCourseIds },
        completedAt: null,
        enrolledAt: { lt: cutoff },
      },
      orderBy: { enrolledAt: 'asc' },
      take: 20,
      include: {
        student: { select: { id: true, name: true, email: true, avatar: true } },
        course: { select: { id: true, title: true } },
      },
    });

    return {
      items: enrollments.map((e) => ({
        enrollmentId: e.id,
        studentId: e.student.id,
        studentName: e.student.name,
        studentEmail: e.student.email,
        studentAvatar: e.student.avatar,
        courseId: e.course.id,
        courseTitle: e.course.title,
        enrolledAt: e.enrolledAt,
        daysOverdue: Math.floor((Date.now() - e.enrolledAt.getTime()) / (24 * 60 * 60 * 1000)),
      })),
    };
  }

  // =====================================================
  // Internal: owned course id scope
  // =====================================================
  private async getOwnedCourseIds(actor: Actor): Promise<string[]> {
    const courses = await this.prisma.client.course.findMany({
      where: { instructorId: actor.id, isDeleted: false },
      select: { id: true },
    });
    return courses.map((c) => c.id);
  }
}

// ---------- helpers ----------

/** Start of ISO week (Monday) at 00:00 local, optionally shifted by `weekOffset` weeks. */
function startOfWeek(d: Date, weekOffset: number): Date {
  const date = new Date(d);
  const day = date.getDay() || 7; // Sun=0 → 7
  if (day !== 1) date.setHours(-24 * (day - 1));
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + weekOffset * 7);
  return date;
}

function weekKey(d: Date): string {
  const y = d.getFullYear();
  const onejan = new Date(y, 0, 1);
  const dayOfYear = Math.floor((d.getTime() - onejan.getTime()) / 86400000) + 1;
  const week = Math.ceil((dayOfYear + onejan.getDay()) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}
