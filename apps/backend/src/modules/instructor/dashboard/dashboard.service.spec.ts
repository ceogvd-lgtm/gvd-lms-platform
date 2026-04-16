import { ProgressStatus } from '@lms/database';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../../common/prisma/prisma.service';

import { InstructorDashboardService } from './dashboard.service';

describe('InstructorDashboardService', () => {
  let service: InstructorDashboardService;
  let prismaMock: {
    client: {
      course: { findMany: jest.Mock };
      lessonProgress: { findMany: jest.Mock; count: jest.Mock };
      courseEnrollment: { count: jest.Mock; findMany: jest.Mock };
      quizAttempt: { aggregate: jest.Mock; findMany: jest.Mock };
    };
  };
  const ACTOR = { id: 'u-instr' };

  beforeEach(async () => {
    prismaMock = {
      client: {
        course: { findMany: jest.fn() },
        lessonProgress: { findMany: jest.fn(), count: jest.fn() },
        courseEnrollment: { count: jest.fn(), findMany: jest.fn() },
        quizAttempt: { aggregate: jest.fn(), findMany: jest.fn() },
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstructorDashboardService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(InstructorDashboardService);
  });

  describe('getStats', () => {
    it('returns zeros when instructor owns no courses', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([]);
      const stats = await service.getStats(ACTOR);
      expect(stats).toEqual({
        totalCourses: 0,
        activeStudents: 0,
        completionRate: 0,
        avgScore: 0,
      });
    });

    it('computes completionRate and avgScore over owned courses only', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      prismaMock.client.lessonProgress.findMany.mockResolvedValue([
        { studentId: 's1' },
        { studentId: 's2' },
        { studentId: 's3' },
      ]);
      prismaMock.client.courseEnrollment.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(15); // completed
      prismaMock.client.quizAttempt.aggregate.mockResolvedValue({ _avg: { score: 78.4 } });

      const stats = await service.getStats(ACTOR);
      expect(stats.totalCourses).toBe(2);
      expect(stats.activeStudents).toBe(3);
      expect(stats.completionRate).toBe(75); // 15/20
      expect(stats.avgScore).toBe(78); // rounded
    });

    it('scopes activeStudents query to courses owned by actor', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.lessonProgress.findMany.mockResolvedValue([]);
      prismaMock.client.courseEnrollment.count.mockResolvedValue(0);
      prismaMock.client.quizAttempt.aggregate.mockResolvedValue({ _avg: { score: null } });

      await service.getStats(ACTOR);
      const call = prismaMock.client.lessonProgress.findMany.mock.calls[0]![0];
      expect(call.where.lesson.chapter.courseId.in).toEqual(['c1']);
    });
  });

  describe('getWeeklyProgress', () => {
    it('returns 8 buckets when no completions', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.lessonProgress.findMany.mockResolvedValue([]);
      const res = await service.getWeeklyProgress(ACTOR, 8);
      expect(res.points).toHaveLength(8);
      expect(res.points.every((p) => p.count === 0)).toBe(true);
    });

    it('clamps weeks to [1, 26]', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.lessonProgress.findMany.mockResolvedValue([]);
      const big = await service.getWeeklyProgress(ACTOR, 999);
      expect(big.points).toHaveLength(26);
    });
  });

  describe('getActivity', () => {
    it('merges enrollments + completions + quiz, sorts desc, slices', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      const t1 = new Date('2026-04-15T10:00:00Z');
      const t2 = new Date('2026-04-15T09:00:00Z');
      const t3 = new Date('2026-04-15T08:00:00Z');

      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          enrolledAt: t2,
          student: { id: 's', name: 'Alice', avatar: null },
          course: { title: 'Safety' },
        },
      ]);
      prismaMock.client.lessonProgress.findMany.mockResolvedValue([
        {
          id: 'p1',
          status: ProgressStatus.COMPLETED,
          completedAt: t1,
          score: 85,
          student: { id: 's', name: 'Alice', avatar: null },
          lesson: { title: 'Intro', chapter: { course: { title: 'Safety' } } },
        },
      ]);
      prismaMock.client.quizAttempt.findMany.mockResolvedValue([
        {
          id: 'q1',
          completedAt: t3,
          score: 8,
          maxScore: 10,
          student: { id: 's', name: 'Alice', avatar: null },
          quiz: { title: 'Quiz 1' },
        },
      ]);

      const res = await service.getActivity(ACTOR, 10);
      expect(res.items).toHaveLength(3);
      expect(res.items[0]!.type).toBe('COMPLETE_LESSON'); // newest
      expect(res.items[1]!.type).toBe('ENROLL');
      expect(res.items[2]!.type).toBe('QUIZ');
      // Quiz score normalized to percent
      expect(res.items[2]!.score).toBe(80);
    });
  });

  describe('getDeadlines', () => {
    it('lists overdue enrollments with daysOverdue', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      const enrolledAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          enrolledAt,
          student: { id: 's', name: 'Bob', email: 'b@x.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      const res = await service.getDeadlines(ACTOR, 7);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.daysOverdue).toBeGreaterThanOrEqual(10);
    });

    it('returns empty when instructor owns no courses', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([]);
      const res = await service.getDeadlines(ACTOR, 7);
      expect(res.items).toEqual([]);
    });
  });
});
