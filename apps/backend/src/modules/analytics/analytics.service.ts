import { Role } from '@lms/database';
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

interface Actor {
  id: string;
  role: Role;
}

// =====================================================
// Response shapes — exported for frontend type-pulling
// =====================================================

export interface DepartmentAnalytics {
  departmentId: string;
  departmentName: string;
  subjectCount: number;
  courseCount: number;
  studentCount: number;
  completionRate: number;
  avgScore: number | null;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    courseCount: number;
    enrolledCount: number;
    completedCount: number;
    avgScore: number | null;
  }>;
}

export interface SystemAnalytics {
  activeStudentsLast7d: number;
  completionRate: number;
  certificatesIssued: number;
  avgScore: number;
  totalCourses: number;
  totalLessons: number;
  totalStudents: number;
}

export interface LessonDifficultyRow {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  avgScore: number;
  attemptCount: number;
  failRate: number;
  avgTimeSpent: number;
}

export interface HeatmapCell {
  hour: number; // 0..23
  day: number; // 0..6 (Sun..Sat)
  count: number;
}

export interface CohortPoint {
  cohortMonth: string; // YYYY-MM
  week: number; // 0,1,2,...
  avgProgress: number;
  studentCount: number;
}

/**
 * Phase 15 — Admin-wide analytics.
 *
 * Separate module from /instructor/analytics (which is scoped to one
 * instructor's own courses). All endpoints here require ADMIN+ except
 * `lesson-difficulty` + `heatmap` which support an INSTRUCTOR-own
 * mode as well.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // GET /analytics/department/:id
  // =====================================================
  async getDepartment(departmentId: string): Promise<DepartmentAnalytics> {
    const department = await this.prisma.client.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true },
    });
    if (!department) throw new NotFoundException('Không tìm thấy ngành');

    const subjects = await this.prisma.client.subject.findMany({
      where: { departmentId },
      include: {
        courses: {
          where: { isDeleted: false },
          select: {
            id: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
    });

    const subjectRows: DepartmentAnalytics['subjects'] = [];
    let totalCourses = 0;
    let totalStudents = 0;
    let totalCompleted = 0;
    let scoreSum = 0;
    let scoreN = 0;

    for (const s of subjects) {
      const courseIds = s.courses.map((c) => c.id);
      const enrolledCount = s.courses.reduce((sum, c) => sum + c._count.enrollments, 0);

      const completedCount = await this.prisma.client.courseEnrollment.count({
        where: { courseId: { in: courseIds }, completedAt: { not: null } },
      });

      // Avg score via LessonProgress.score across all lessons in subject's courses
      const scoreAgg = await this.prisma.client.lessonProgress.aggregate({
        where: {
          score: { not: null },
          lesson: { chapter: { courseId: { in: courseIds } } },
        },
        _avg: { score: true },
        _count: { _all: true },
      });
      const subjectAvg = scoreAgg._avg.score !== null ? Math.round(scoreAgg._avg.score) : null;

      subjectRows.push({
        subjectId: s.id,
        subjectName: s.name,
        courseCount: s.courses.length,
        enrolledCount,
        completedCount,
        avgScore: subjectAvg,
      });

      totalCourses += s.courses.length;
      totalStudents += enrolledCount;
      totalCompleted += completedCount;
      if (subjectAvg !== null && scoreAgg._count._all > 0) {
        scoreSum += subjectAvg * scoreAgg._count._all;
        scoreN += scoreAgg._count._all;
      }
    }

    return {
      departmentId: department.id,
      departmentName: department.name,
      subjectCount: subjects.length,
      courseCount: totalCourses,
      studentCount: totalStudents,
      completionRate: totalStudents > 0 ? Math.round((totalCompleted / totalStudents) * 100) : 0,
      avgScore: scoreN > 0 ? Math.round(scoreSum / scoreN) : null,
      subjects: subjectRows,
    };
  }

  // =====================================================
  // GET /analytics/cohort
  // =====================================================
  /**
   * Group enrollments by month, then for each cohort emit a series of
   * (week-since-enroll, avgProgressPercent) points. The frontend feeds
   * this into a line chart with one line per cohort month.
   *
   * We cap at the last 6 cohorts to keep the legend readable; older
   * months are dropped.
   */
  async getCohort(): Promise<CohortPoint[]> {
    // Pull all enrollments with enrolledAt + progressPercent
    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: { course: { isDeleted: false } },
      select: { enrolledAt: true, progressPercent: true, lastActiveAt: true },
    });

    // Bucket by cohort month
    const byCohort = new Map<string, Array<{ enrolledAt: Date; progressPercent: number }>>();
    for (const e of enrollments) {
      const month = `${e.enrolledAt.getUTCFullYear()}-${String(e.enrolledAt.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = byCohort.get(month) ?? [];
      bucket.push(e);
      byCohort.set(month, bucket);
    }

    // Keep last 6 cohorts by month
    const months = [...byCohort.keys()].sort().slice(-6);

    // For each cohort, emit weeks 0..8
    const points: CohortPoint[] = [];
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const month of months) {
      const bucket = byCohort.get(month) ?? [];
      const studentCount = bucket.length;
      // Figure out max weeks this cohort has been alive for
      const earliestMs = Math.min(...bucket.map((e) => e.enrolledAt.getTime()));
      const maxWeek = Math.min(8, Math.floor((now - earliestMs) / WEEK_MS));

      for (let w = 0; w <= maxWeek; w++) {
        // Average progressPercent of students whose enroll-to-now ≥ w weeks.
        const eligible = bucket.filter((e) => now - e.enrolledAt.getTime() >= w * WEEK_MS);
        if (eligible.length === 0) break;
        // We don't have historical progress snapshots — use current
        // progressPercent scaled by week/8 as a sensible proxy. A more
        // faithful implementation would log progress snapshots daily.
        const scale = Math.min(1, (w + 1) / (maxWeek + 1));
        const avg = eligible.reduce((s, e) => s + e.progressPercent, 0) / eligible.length;
        points.push({
          cohortMonth: month,
          week: w,
          avgProgress: Math.round(avg * scale),
          studentCount,
        });
      }
    }

    return points;
  }

  // =====================================================
  // GET /analytics/system
  // =====================================================
  async getSystem(): Promise<SystemAnalytics> {
    const DAY = 24 * 60 * 60 * 1000;
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY);

    const [
      activeStudentsLast7d,
      totalEnrollments,
      completedEnrollments,
      certificatesIssued,
      totalCourses,
      totalLessons,
      totalStudents,
      scoreAgg,
    ] = await Promise.all([
      this.prisma.client.courseEnrollment.groupBy({
        by: ['studentId'],
        where: { lastActiveAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.client.courseEnrollment.count({ where: { course: { isDeleted: false } } }),
      this.prisma.client.courseEnrollment.count({
        where: { completedAt: { not: null }, course: { isDeleted: false } },
      }),
      this.prisma.client.certificate.count({ where: { status: 'ACTIVE' } }),
      this.prisma.client.course.count({ where: { isDeleted: false } }),
      this.prisma.client.lesson.count({ where: { isDeleted: false } }),
      this.prisma.client.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.client.lessonProgress.aggregate({
        where: { score: { not: null } },
        _avg: { score: true },
      }),
    ]);

    return {
      activeStudentsLast7d: activeStudentsLast7d.length,
      completionRate:
        totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0,
      certificatesIssued,
      avgScore: scoreAgg._avg.score !== null ? Math.round(scoreAgg._avg.score) : 0,
      totalCourses,
      totalLessons,
      totalStudents,
    };
  }

  // =====================================================
  // GET /analytics/lesson-difficulty
  // =====================================================
  async getLessonDifficulty(actor: Actor): Promise<LessonDifficultyRow[]> {
    const where: Record<string, unknown> = { isDeleted: false };
    if (actor.role === Role.INSTRUCTOR) {
      where.chapter = { course: { instructorId: actor.id, isDeleted: false } };
    }

    const lessons = await this.prisma.client.lesson.findMany({
      where,
      select: {
        id: true,
        title: true,
        chapter: { select: { course: { select: { id: true, title: true } } } },
        quizzes: { select: { id: true, passScore: true } },
      },
    });

    const rows: LessonDifficultyRow[] = [];
    for (const l of lessons) {
      const quiz = l.quizzes[0];

      // ------- avgScore (percent 0..100) -------
      //
      // Historically we averaged `LessonProgress.score` directly — but
      // that column stores the raw quiz score (e.g. 11 / 10 → 110) not a
      // percentage, which produced > 100% on the difficulty panel.
      //
      // Phase 15 post-verify fix: compute the percent per-attempt from
      // (score / maxScore), clamp each row to [0, 100], and average the
      // clamped values. Covers the common case (lesson has a quiz) and
      // the edge cases:
      //   - no quiz      → fall back to lessonProgress.score clamped
      //   - no attempts  → skip lesson entirely (same as before)
      let avgScore: number;
      let attemptCount: number;
      let avgTimeSpent: number;

      if (quiz) {
        const attempts = await this.prisma.client.quizAttempt.findMany({
          where: { quizId: quiz.id, completedAt: { not: null } },
          select: { score: true, maxScore: true },
        });
        if (attempts.length === 0) continue;
        const percents = attempts.map((a) => {
          if (a.maxScore <= 0) return 0;
          return Math.min(100, Math.max(0, (a.score / a.maxScore) * 100));
        });
        avgScore = Math.round(percents.reduce((s, p) => s + p, 0) / percents.length);
        attemptCount = attempts.length;

        const timeAgg = await this.prisma.client.lessonProgress.aggregate({
          where: { lessonId: l.id, timeSpent: { gt: 0 } },
          _avg: { timeSpent: true },
        });
        avgTimeSpent = Math.round(timeAgg._avg.timeSpent ?? 0);
      } else {
        const progAgg = await this.prisma.client.lessonProgress.aggregate({
          where: { lessonId: l.id, score: { not: null } },
          _avg: { score: true, timeSpent: true },
          _count: { _all: true },
        });
        if (progAgg._count._all === 0) continue;
        const raw = progAgg._avg.score ?? 0;
        // Clamp to [0, 100] even though there's no reliable maxScore —
        // prevents "110%" bleed from legacy data.
        avgScore = Math.min(100, Math.max(0, Math.round(raw)));
        attemptCount = progAgg._count._all;
        avgTimeSpent = Math.round(progAgg._avg.timeSpent ?? 0);
      }

      // ------- failRate -------
      // Failed = attempt whose percent < quiz.passScore. Computed row-
      // per-row (not via a Prisma where) because each attempt's
      // maxScore can differ (random-pick quizzes, question-weighting).
      let failRate = 0;
      if (quiz) {
        const attempts = await this.prisma.client.quizAttempt.findMany({
          where: { quizId: quiz.id, completedAt: { not: null } },
          select: { score: true, maxScore: true },
        });
        if (attempts.length > 0) {
          const failed = attempts.filter((a) => {
            if (a.maxScore <= 0) return false;
            const pct = (a.score / a.maxScore) * 100;
            return pct < quiz.passScore;
          }).length;
          failRate = Math.round((failed / attempts.length) * 100);
        }
      }

      rows.push({
        lessonId: l.id,
        lessonTitle: l.title,
        courseId: l.chapter.course.id,
        courseTitle: l.chapter.course.title,
        avgScore,
        attemptCount,
        failRate,
        avgTimeSpent,
      });
    }

    // Sort ascending by avgScore so the "hardest" appear first
    rows.sort((a, b) => a.avgScore - b.avgScore);
    return rows;
  }

  // =====================================================
  // GET /analytics/heatmap
  // =====================================================
  async getHeatmap(actor: Actor): Promise<HeatmapCell[]> {
    // Base signal: LessonProgress.lastViewAt (any update). For instructors
    // we scope to their own courses.
    const where: Record<string, unknown> = {};
    if (actor.role === Role.INSTRUCTOR) {
      where.lesson = { chapter: { course: { instructorId: actor.id, isDeleted: false } } };
    }

    const rows = await this.prisma.client.lessonProgress.findMany({
      where,
      select: { lastViewAt: true },
    });

    const cells = new Map<string, number>();
    for (const r of rows) {
      const d = r.lastViewAt;
      const day = d.getDay(); // 0..6
      const hour = d.getHours(); // 0..23
      const key = `${day}-${hour}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }

    const out: HeatmapCell[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        out.push({ day, hour, count: cells.get(key) ?? 0 });
      }
    }
    return out;
  }
}
