import { Role } from '@lms/database';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { AnalyticsService } from './analytics.service';

/**
 * Phase 15 — Unit tests for admin-wide AnalyticsService.
 *
 * Covers the three methods with non-trivial transformation logic:
 *   - getLessonDifficulty — sorts ASC by avgScore so "hardest" is first
 *   - getHeatmap — always returns 7×24=168 cells, filled with zeros for
 *     hours with no activity
 *   - getCohort — buckets by enrolledAt month (UTC) and emits one point
 *     per week
 *
 * `getSystem` + `getDepartment` are mostly Prisma aggregate call-throughs
 * — covered by the e2e smoke test, not unit-tested here.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: {
    client: {
      lesson: { findMany: jest.Mock };
      lessonProgress: { aggregate: jest.Mock; findMany: jest.Mock };
      quizAttempt: { count: jest.Mock; findMany: jest.Mock };
      courseEnrollment: { findMany: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: { findMany: jest.fn() },
        lessonProgress: { aggregate: jest.fn(), findMany: jest.fn() },
        quizAttempt: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        courseEnrollment: { findMany: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(AnalyticsService);
  });

  // =====================================================
  // getLessonDifficulty
  // =====================================================
  describe('getLessonDifficulty', () => {
    it('sorts lessons ASC by avgScore — hardest first', async () => {
      prisma.client.lesson.findMany.mockResolvedValue([
        {
          id: 'l-easy',
          title: 'Easy',
          chapter: { course: { id: 'c1', title: 'Course' } },
          quizzes: [],
        },
        {
          id: 'l-hard',
          title: 'Hard',
          chapter: { course: { id: 'c1', title: 'Course' } },
          quizzes: [],
        },
        {
          id: 'l-medium',
          title: 'Medium',
          chapter: { course: { id: 'c1', title: 'Course' } },
          quizzes: [],
        },
      ]);
      // aggregate returns different avg per lesson in order called
      prisma.client.lessonProgress.aggregate
        .mockResolvedValueOnce({ _avg: { score: 85, timeSpent: 200 }, _count: { _all: 10 } })
        .mockResolvedValueOnce({ _avg: { score: 30, timeSpent: 400 }, _count: { _all: 10 } })
        .mockResolvedValueOnce({ _avg: { score: 65, timeSpent: 300 }, _count: { _all: 10 } });

      const rows = await service.getLessonDifficulty({ id: 'admin', role: Role.ADMIN });

      expect(rows).toHaveLength(3);
      expect(rows[0]!.lessonTitle).toBe('Hard');
      expect(rows[0]!.avgScore).toBe(30);
      expect(rows[1]!.lessonTitle).toBe('Medium');
      expect(rows[2]!.lessonTitle).toBe('Easy');
    });

    it('omits lessons with zero attempts from the output', async () => {
      prisma.client.lesson.findMany.mockResolvedValue([
        {
          id: 'l-1',
          title: 'Untried lesson',
          chapter: { course: { id: 'c1', title: 'Course' } },
          quizzes: [],
        },
      ]);
      prisma.client.lessonProgress.aggregate.mockResolvedValue({
        _avg: { score: null, timeSpent: null },
        _count: { _all: 0 },
      });

      const rows = await service.getLessonDifficulty({ id: 'admin', role: Role.ADMIN });
      expect(rows).toHaveLength(0);
    });

    // Phase 15 post-verify fix — avgScore must never exceed 100%.
    // When a lesson has a quiz we compute percents from (score / maxScore),
    // clamp per-attempt, and average the clamped values.
    it('computes avgScore as percent via (score / maxScore) × 100, clamped 0..100', async () => {
      prisma.client.lesson.findMany.mockResolvedValue([
        {
          id: 'l-quiz',
          title: 'With quiz',
          chapter: { course: { id: 'c1', title: 'Course' } },
          // A quiz whose max is 10 pts — old code would read
          // LessonProgress.score=11 and report 11% as "11 / 100 * 100".
          // New code reads QuizAttempt.score / QuizAttempt.maxScore so
          // it correctly reports each attempt's percent.
          quizzes: [{ id: 'q1', passScore: 70 }],
        },
      ]);
      prisma.client.quizAttempt.findMany.mockResolvedValue([
        { score: 8, maxScore: 10 }, // 80%
        { score: 5, maxScore: 10 }, // 50%
        { score: 11, maxScore: 10 }, // bonus → clamped to 100%
      ]);
      prisma.client.lessonProgress.aggregate.mockResolvedValue({
        _avg: { timeSpent: 150 },
        _count: { _all: 3 },
      });

      const rows = await service.getLessonDifficulty({ id: 'admin', role: Role.ADMIN });
      expect(rows).toHaveLength(1);
      // (80 + 50 + 100) / 3 = 76.67 → rounded 77
      expect(rows[0]!.avgScore).toBe(77);
      expect(rows[0]!.avgScore).toBeLessThanOrEqual(100);
      expect(rows[0]!.attemptCount).toBe(3);
    });

    // Quiz passScore is 70; with 2 fails (40%, 55%) and 1 pass (80%) the
    // failRate is 2/3 → 67.
    it('computes failRate from per-attempt percent (maxScore varies)', async () => {
      prisma.client.lesson.findMany.mockResolvedValue([
        {
          id: 'l1',
          title: 'Hard quiz',
          chapter: { course: { id: 'c1', title: 'Course' } },
          quizzes: [{ id: 'q1', passScore: 70 }],
        },
      ]);
      prisma.client.quizAttempt.findMany.mockResolvedValue([
        { score: 4, maxScore: 10 }, // 40% (fail)
        { score: 11, maxScore: 20 }, // 55% (fail)
        { score: 8, maxScore: 10 }, // 80% (pass)
      ]);
      prisma.client.lessonProgress.aggregate.mockResolvedValue({
        _avg: { timeSpent: 100 },
        _count: { _all: 3 },
      });

      const rows = await service.getLessonDifficulty({ id: 'admin', role: Role.ADMIN });
      expect(rows[0]!.failRate).toBe(67);
    });

    // No-quiz fallback — clamp legacy raw scores > 100 so they don't
    // bleed into the UI.
    it('clamps legacy LessonProgress.score > 100 when no quiz is attached', async () => {
      prisma.client.lesson.findMany.mockResolvedValue([
        {
          id: 'l-legacy',
          title: 'Legacy row with raw score > 100',
          chapter: { course: { id: 'c1', title: 'Course' } },
          quizzes: [],
        },
      ]);
      prisma.client.lessonProgress.aggregate.mockResolvedValue({
        _avg: { score: 110, timeSpent: 300 },
        _count: { _all: 1 },
      });

      const rows = await service.getLessonDifficulty({ id: 'admin', role: Role.ADMIN });
      expect(rows[0]!.avgScore).toBe(100);
    });
  });

  // =====================================================
  // getHeatmap
  // =====================================================
  describe('getHeatmap', () => {
    it('returns exactly 7×24=168 cells even when no activity', async () => {
      prisma.client.lessonProgress.findMany.mockResolvedValue([]);
      const cells = await service.getHeatmap({ id: 'admin', role: Role.ADMIN });
      expect(cells).toHaveLength(168);
      expect(cells.every((c) => c.count === 0)).toBe(true);
    });

    it('aggregates same-hour activity into the correct cell', async () => {
      const monday3pm = new Date('2026-04-13T15:30:00'); // local time — getDay/getHours
      prisma.client.lessonProgress.findMany.mockResolvedValue([
        { lastViewAt: monday3pm },
        { lastViewAt: monday3pm },
        { lastViewAt: monday3pm },
      ]);

      const cells = await service.getHeatmap({ id: 'admin', role: Role.ADMIN });
      const target = cells.find(
        (c) => c.day === monday3pm.getDay() && c.hour === monday3pm.getHours(),
      );
      expect(target).toBeDefined();
      expect(target!.count).toBe(3);
    });

    it('output format matches spec — each cell has {hour, day, count}', async () => {
      prisma.client.lessonProgress.findMany.mockResolvedValue([]);
      const cells = await service.getHeatmap({ id: 'admin', role: Role.ADMIN });
      for (const cell of cells) {
        expect(cell).toEqual(
          expect.objectContaining({
            hour: expect.any(Number),
            day: expect.any(Number),
            count: expect.any(Number),
          }),
        );
        expect(cell.hour).toBeGreaterThanOrEqual(0);
        expect(cell.hour).toBeLessThanOrEqual(23);
        expect(cell.day).toBeGreaterThanOrEqual(0);
        expect(cell.day).toBeLessThanOrEqual(6);
      }
    });
  });

  // =====================================================
  // getCohort
  // =====================================================
  describe('getCohort', () => {
    it('groups enrollments by enrolledAt month (YYYY-MM)', async () => {
      // Two cohorts: 2026-03 (one student) and 2026-04 (two students)
      prisma.client.courseEnrollment.findMany.mockResolvedValue([
        {
          enrolledAt: new Date('2026-03-10T00:00:00Z'),
          progressPercent: 40,
          lastActiveAt: new Date(),
        },
        {
          enrolledAt: new Date('2026-04-05T00:00:00Z'),
          progressPercent: 20,
          lastActiveAt: new Date(),
        },
        {
          enrolledAt: new Date('2026-04-20T00:00:00Z'),
          progressPercent: 60,
          lastActiveAt: new Date(),
        },
      ]);

      const points = await service.getCohort();
      const cohorts = [...new Set(points.map((p) => p.cohortMonth))];
      expect(cohorts).toEqual(expect.arrayContaining(['2026-03', '2026-04']));
      // studentCount for 2026-04 cohort should be 2
      const aprPoint = points.find((p) => p.cohortMonth === '2026-04');
      expect(aprPoint!.studentCount).toBe(2);
    });

    it('returns empty array when no enrollments exist', async () => {
      prisma.client.courseEnrollment.findMany.mockResolvedValue([]);
      const points = await service.getCohort();
      expect(points).toEqual([]);
    });
  });
});
