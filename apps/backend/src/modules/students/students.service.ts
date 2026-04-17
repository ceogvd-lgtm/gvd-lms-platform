import { ProgressStatus } from '@lms/database';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import { XpService } from './xp.service';

// =====================================================
// Response shapes — exported for the frontend lib
// =====================================================

export interface DashboardPayload {
  user: { id: string; name: string; email: string; avatar: string | null; role: string };
  xp: { totalXP: number; level: number };
  overallProgress: { percent: number; completedLessons: number; totalLessons: number };
  streak: { current: number; longest: number };
  enrolledCourses: Array<{
    id: string;
    title: string;
    thumbnailUrl: string | null;
    progressPercent: number;
    nextLessonId: string | null;
    nextLessonTitle: string | null;
  }>;
  nextLesson: { id: string; title: string; courseTitle: string } | null;
  recentScores: Array<{ lessonTitle: string; score: number; maxScore: number; date: Date }>;
}

export interface StreakPayload {
  currentStreak: number;
  longestStreak: number;
  /** Last 30 days; days with no activity are included with count=0 */
  heatmapData: Array<{ date: string; count: number }>;
}

export interface MyLearningNode {
  department: { id: string; name: string };
  subjects: Array<{
    id: string;
    name: string;
    avgScore: number;
    courses: Array<{
      id: string;
      title: string;
      thumbnailUrl: string | null;
      progressPercent: number;
      chapters: Array<{
        id: string;
        title: string;
        order: number;
        lessons: Array<{
          id: string;
          title: string;
          type: 'THEORY' | 'PRACTICE';
          status: ProgressStatus;
          score: number | null;
          isLocked: boolean;
          estimatedMinutes: number;
        }>;
      }>;
    }>;
  }>;
}

export interface ProgressPayload {
  doughnutData: Array<{ department: string; percent: number }>;
  barChartData: Array<{ subject: string; avgScore: number }>;
  heatmapData: Array<{ date: string; count: number }>;
  timeline: Array<{
    date: Date;
    lessonTitle: string;
    type: 'LESSON' | 'QUIZ' | 'PRACTICE';
    score: number | null;
  }>;
  classComparison: { myAvg: number; classAvg: number };
}

// =====================================================
// Helpers
// =====================================================

const DAY_MS = 24 * 60 * 60 * 1000;
function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Walk a sorted array of daily activity → longest + current streak.
 * `days` is a Set of "YYYY-MM-DD" strings where the student did something.
 */
function computeStreaks(days: Set<string>, today: Date): { current: number; longest: number } {
  // Current streak = consecutive days ending today (or yesterday — we
  // allow a 1-day grace so the count doesn't reset at midnight).
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * DAY_MS);
    if (days.has(yyyymmdd(d))) {
      current += 1;
    } else if (i === 0) {
      // Today itself empty — grace period: try from yesterday
      continue;
    } else {
      break;
    }
  }

  // Longest streak ever — iterate the set in date order.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of sorted) {
    const curr = new Date(d + 'T00:00:00Z');
    if (prev && curr.getTime() - prev.getTime() === DAY_MS) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = curr;
  }
  return { current, longest };
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xp: XpService,
  ) {}

  // =====================================================
  // GET /students/dashboard
  // =====================================================
  async getDashboard(studentId: string): Promise<DashboardPayload> {
    const [user, xp, enrollments] = await Promise.all([
      this.prisma.client.user.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, email: true, avatar: true, role: true },
      }),
      this.xp.getForStudent(studentId),
      this.prisma.client.courseEnrollment.findMany({
        where: { studentId },
        orderBy: { enrolledAt: 'desc' },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              isDeleted: true,
            },
          },
        },
      }),
    ]);
    if (!user) throw new Error('User not found');

    const live = enrollments.filter((e) => !e.course.isDeleted);
    const courseIds = live.map((e) => e.courseId);

    // Cross-course aggregates — cheap since courses/chapters/lessons are
    // small per enrollment. One round-trip per layer.
    const chapters = await this.prisma.client.chapter.findMany({
      where: { courseId: { in: courseIds } },
      select: { id: true, courseId: true, order: true },
      orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
    });
    const chapterIds = chapters.map((c) => c.id);
    const chapterIdToCourseId = new Map(chapters.map((c) => [c.id, c.courseId]));

    const lessons = await this.prisma.client.lesson.findMany({
      where: { chapterId: { in: chapterIds }, isDeleted: false },
      select: { id: true, chapterId: true, title: true, order: true },
      orderBy: [{ chapterId: 'asc' }, { order: 'asc' }],
    });
    const lessonIds = lessons.map((l) => l.id);

    const progresses =
      lessonIds.length === 0
        ? []
        : await this.prisma.client.lessonProgress.findMany({
            where: { studentId, lessonId: { in: lessonIds } },
          });
    const completedSet = new Set(
      progresses.filter((p) => p.status === ProgressStatus.COMPLETED).map((p) => p.lessonId),
    );

    // Per-course progress + next-lesson pointer
    const lessonsPerCourse = new Map<string, { id: string; title: string }[]>();
    for (const lesson of lessons) {
      const courseId = chapterIdToCourseId.get(lesson.chapterId);
      if (!courseId) continue;
      const bucket = lessonsPerCourse.get(courseId) ?? [];
      bucket.push({ id: lesson.id, title: lesson.title });
      lessonsPerCourse.set(courseId, bucket);
    }

    const enrolledCourses = live.map((e) => {
      const list = lessonsPerCourse.get(e.courseId) ?? [];
      const total = list.length;
      const completed = list.filter((l) => completedSet.has(l.id)).length;
      const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
      const next = list.find((l) => !completedSet.has(l.id)) ?? list[0] ?? null;
      return {
        id: e.course.id,
        title: e.course.title,
        thumbnailUrl: e.course.thumbnailUrl,
        progressPercent,
        nextLessonId: next?.id ?? null,
        nextLessonTitle: next?.title ?? null,
      };
    });

    const totalLessons = lessons.length;
    const completedLessons = completedSet.size;

    // Next-lesson banner: first unfinished lesson across all enrollments
    let nextLesson: DashboardPayload['nextLesson'] = null;
    for (const e of live) {
      const list = lessonsPerCourse.get(e.courseId) ?? [];
      const candidate = list.find((l) => !completedSet.has(l.id));
      if (candidate) {
        nextLesson = { id: candidate.id, title: candidate.title, courseTitle: e.course.title };
        break;
      }
    }

    const streak = await this.computeStreakForStudent(studentId);

    // Recent quiz scores (last 5)
    const recentAttempts = await this.prisma.client.quizAttempt.findMany({
      where: { studentId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      take: 5,
      include: { quiz: { select: { lesson: { select: { title: true } } } } },
    });
    const recentScores = recentAttempts.map((a) => ({
      lessonTitle: a.quiz.lesson.title,
      score: a.score,
      maxScore: a.maxScore,
      date: a.completedAt!,
    }));

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
      },
      xp,
      overallProgress: {
        percent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
        completedLessons,
        totalLessons,
      },
      streak: { current: streak.currentStreak, longest: streak.longestStreak },
      enrolledCourses,
      nextLesson,
      recentScores,
    };
  }

  // =====================================================
  // GET /students/streak
  // =====================================================
  async getStreak(studentId: string): Promise<StreakPayload> {
    return this.computeStreakForStudent(studentId);
  }

  private async computeStreakForStudent(studentId: string): Promise<StreakPayload> {
    const now = new Date();
    const since = new Date(now.getTime() - 60 * DAY_MS);

    // "Activity" = any lesson_progress updated or quiz_attempt submitted
    // in the window. Both are cheap indexed queries.
    const [progRows, attemptRows] = await Promise.all([
      this.prisma.client.lessonProgress.findMany({
        where: { studentId, lastViewAt: { gte: since } },
        select: { lastViewAt: true },
      }),
      this.prisma.client.quizAttempt.findMany({
        where: { studentId, completedAt: { not: null, gte: since } },
        select: { completedAt: true },
      }),
    ]);

    const countByDate = new Map<string, number>();
    for (const p of progRows) {
      const key = yyyymmdd(p.lastViewAt);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    }
    for (const a of attemptRows) {
      const key = yyyymmdd(a.completedAt!);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    }

    const activeDays = new Set(countByDate.keys());
    const { current, longest } = computeStreaks(activeDays, now);

    // Build heatmap last 30 days (zero-fill for days with no activity)
    const heatmapData: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * DAY_MS);
      const key = yyyymmdd(d);
      heatmapData.push({ date: key, count: countByDate.get(key) ?? 0 });
    }

    return { currentStreak: current, longestStreak: longest, heatmapData };
  }

  // =====================================================
  // GET /students/my-learning — locked lessons + per-node aggregates
  // =====================================================
  async getMyLearning(studentId: string): Promise<MyLearningNode[]> {
    const enrollments = await this.prisma.client.courseEnrollment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            subject: { include: { department: true } },
            chapters: {
              orderBy: { order: 'asc' },
              include: {
                lessons: {
                  where: { isDeleted: false },
                  orderBy: { order: 'asc' },
                  include: {
                    theoryContent: { select: { duration: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const lessonIds = enrollments.flatMap((e) =>
      e.course.chapters.flatMap((c) => c.lessons.map((l) => l.id)),
    );
    const progresses =
      lessonIds.length === 0
        ? []
        : await this.prisma.client.lessonProgress.findMany({
            where: { studentId, lessonId: { in: lessonIds } },
          });
    const progressByLessonId = new Map(progresses.map((p) => [p.lessonId, p]));
    const completedSet = new Set(
      progresses.filter((p) => p.status === ProgressStatus.COMPLETED).map((p) => p.lessonId),
    );

    // Group by department → subject → course
    type Agg = MyLearningNode;
    const byDepartmentId = new Map<string, Agg>();

    for (const e of enrollments) {
      if (e.course.isDeleted) continue;
      const dept = e.course.subject.department;
      const subj = e.course.subject;

      let deptNode = byDepartmentId.get(dept.id);
      if (!deptNode) {
        deptNode = { department: { id: dept.id, name: dept.name }, subjects: [] };
        byDepartmentId.set(dept.id, deptNode);
      }

      let subjNode = deptNode.subjects.find((s) => s.id === subj.id);
      if (!subjNode) {
        subjNode = { id: subj.id, name: subj.name, avgScore: 0, courses: [] };
        deptNode.subjects.push(subjNode);
      }

      // Build chapter + lesson tree for this course with lock logic
      let previousLessonCompleted = true;
      const chapters = e.course.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        order: ch.order,
        lessons: ch.lessons.map((l) => {
          const progress = progressByLessonId.get(l.id);
          const completed = !!progress && progress.status === ProgressStatus.COMPLETED;
          const isLocked = !previousLessonCompleted && !completed;
          // Flip the flag ONLY when we actually processed a lesson — so
          // completion cascades correctly across chapter boundaries.
          previousLessonCompleted = completed;
          const durationSec = l.theoryContent?.duration ?? 0;
          return {
            id: l.id,
            title: l.title,
            type: l.type as 'THEORY' | 'PRACTICE',
            status: progress?.status ?? ProgressStatus.NOT_STARTED,
            score: progress?.score ?? null,
            isLocked,
            estimatedMinutes: Math.max(1, Math.ceil(durationSec / 60)),
          };
        }),
      }));

      const courseLessonIds = chapters.flatMap((c) => c.lessons.map((l) => l.id));
      const courseCompleted = courseLessonIds.filter((id) => completedSet.has(id)).length;
      const progressPercent =
        courseLessonIds.length > 0
          ? Math.round((courseCompleted / courseLessonIds.length) * 100)
          : 0;

      subjNode.courses.push({
        id: e.course.id,
        title: e.course.title,
        thumbnailUrl: e.course.thumbnailUrl,
        progressPercent,
        chapters,
      });
    }

    // Subject avgScore — mean of lesson progress scores for that subject
    for (const dept of byDepartmentId.values()) {
      for (const subj of dept.subjects) {
        const allLessonIds = subj.courses.flatMap((c) =>
          c.chapters.flatMap((ch) => ch.lessons.map((l) => l.id)),
        );
        const scores = allLessonIds
          .map((id) => progressByLessonId.get(id)?.score)
          .filter((s): s is number => typeof s === 'number');
        subj.avgScore =
          scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      }
    }

    return [...byDepartmentId.values()];
  }

  // =====================================================
  // GET /students/progress — charts payload
  // =====================================================
  async getProgress(studentId: string): Promise<ProgressPayload> {
    const tree = await this.getMyLearning(studentId);
    const streak = await this.computeStreakForStudent(studentId);

    const doughnutData = tree.map((d) => {
      const allLessons = d.subjects.flatMap((s) =>
        s.courses.flatMap((c) => c.chapters.flatMap((ch) => ch.lessons)),
      );
      const completed = allLessons.filter((l) => l.status === ProgressStatus.COMPLETED).length;
      const percent = allLessons.length > 0 ? Math.round((completed / allLessons.length) * 100) : 0;
      return { department: d.department.name, percent };
    });

    const barChartData = tree.flatMap((d) =>
      d.subjects.map((s) => ({ subject: s.name, avgScore: s.avgScore })),
    );

    // Timeline — union of LessonProgress completions + QuizAttempt submissions
    const [completedProg, attempts] = await Promise.all([
      this.prisma.client.lessonProgress.findMany({
        where: { studentId, status: ProgressStatus.COMPLETED, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 30,
        include: { lesson: { select: { title: true, type: true } } },
      }),
      this.prisma.client.quizAttempt.findMany({
        where: { studentId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 30,
        include: { quiz: { select: { lesson: { select: { title: true } } } } },
      }),
    ]);

    const timeline: ProgressPayload['timeline'] = [
      ...completedProg.map((p) => ({
        date: p.completedAt!,
        lessonTitle: p.lesson.title,
        type: (p.lesson.type === 'PRACTICE' ? 'PRACTICE' : 'LESSON') as 'LESSON' | 'PRACTICE',
        score: p.score ?? null,
      })),
      ...attempts.map((a) => ({
        date: a.completedAt!,
        lessonTitle: a.quiz.lesson.title,
        type: 'QUIZ' as const,
        score: a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0,
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 30);

    // Class comparison — my avg quiz score vs avg of every student on the
    // same quizzes. Single aggregate query per side.
    const myAttempts = await this.prisma.client.quizAttempt.aggregate({
      where: { studentId, completedAt: { not: null } },
      _avg: { score: true },
    });
    const classAttempts = await this.prisma.client.quizAttempt.aggregate({
      where: { completedAt: { not: null } },
      _avg: { score: true },
    });

    return {
      doughnutData,
      barChartData,
      heatmapData: streak.heatmapData,
      timeline,
      classComparison: {
        myAvg: Math.round(myAttempts._avg.score ?? 0),
        classAvg: Math.round(classAttempts._avg.score ?? 0),
      },
    };
  }

  // =====================================================
  // GET /students/xp
  // =====================================================
  async getXp(studentId: string): Promise<{ totalXP: number; level: number }> {
    return this.xp.getForStudent(studentId);
  }
}
