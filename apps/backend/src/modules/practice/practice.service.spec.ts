import { ProgressStatus } from '@lms/database';
import { Role } from '@lms/types';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { PracticeService } from './practice.service';

/**
 * Unit tests for PracticeService.
 *
 * Scope:
 *   - startAttempt honours maxAttempts
 *   - startAttempt creates an IN_PROGRESS attempt with the right shape
 *   - completeAttempt cascades to LessonProgress COMPLETED on pass
 *   - completeAttempt leaves LessonProgress IN_PROGRESS on fail
 *
 * The scoring math itself is tested separately in scoring-engine.spec.ts.
 */
describe('PracticeService', () => {
  let service: PracticeService;
  let prisma: {
    client: {
      practiceContent: { findUnique: jest.Mock };
      practiceAttempt: {
        count: jest.Mock;
        create: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
        findMany: jest.Mock;
      };
      lessonProgress: { upsert: jest.Mock };
    };
  };

  const student = { id: 'student-1', role: Role.STUDENT };

  const buildPracticeContent = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'pc-1',
    lessonId: 'lesson-1',
    introduction: '',
    objectives: [],
    webglUrl: 'https://minio/lms/content/webgl/lesson-1/index.html',
    scoringConfig: {
      steps: [
        { stepId: 's1', maxPoints: 50, isMandatory: true },
        { stepId: 's2', maxPoints: 50, isMandatory: true },
      ],
      safetyChecklist: [{ safetyId: 'helmet', isCritical: true }],
    },
    safetyChecklist: { items: [] },
    passScore: 70,
    timeLimit: 600,
    maxAttempts: 3,
    lesson: {
      id: 'lesson-1',
      isDeleted: false,
      chapter: { course: { id: 'course-1', instructorId: 'instructor-1' } },
    },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      client: {
        practiceContent: { findUnique: jest.fn() },
        practiceAttempt: {
          count: jest.fn(),
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
          findMany: jest.fn(),
        },
        lessonProgress: { upsert: jest.fn().mockResolvedValue({}) },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [PracticeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(PracticeService);
  });

  // =====================================================
  // startAttempt
  // =====================================================
  describe('startAttempt', () => {
    it('creates an IN_PROGRESS PracticeAttempt and returns scoring config', async () => {
      prisma.client.practiceContent.findUnique.mockResolvedValue(buildPracticeContent());
      prisma.client.practiceAttempt.count.mockResolvedValue(0);
      prisma.client.practiceAttempt.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'attempt-1', ...data }),
      );

      const res = await service.startAttempt(student, { lessonId: 'lesson-1' });

      expect(res.attemptId).toBe('attempt-1');
      expect(res.attemptsUsed).toBe(1);
      expect(res.scoringConfig.steps).toHaveLength(2);
      expect(res.scoringConfig.passScore).toBe(70);
      expect(res.timeLimit).toBe(600);
      const createCall = prisma.client.practiceAttempt.create.mock.calls[0][0];
      expect(createCall.data.status).toBe(ProgressStatus.IN_PROGRESS);
      expect(createCall.data.studentId).toBe(student.id);
    });

    it('rejects with 403 when maxAttempts is exceeded', async () => {
      prisma.client.practiceContent.findUnique.mockResolvedValue(buildPracticeContent());
      prisma.client.practiceAttempt.count.mockResolvedValue(3); // already 3 attempts

      await expect(service.startAttempt(student, { lessonId: 'lesson-1' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.client.practiceAttempt.create).not.toHaveBeenCalled();
    });

    it('allows unlimited attempts when maxAttempts is null', async () => {
      prisma.client.practiceContent.findUnique.mockResolvedValue(
        buildPracticeContent({ maxAttempts: null }),
      );
      prisma.client.practiceAttempt.count.mockResolvedValue(99);
      prisma.client.practiceAttempt.create.mockResolvedValue({ id: 'attempt-1' });

      const res = await service.startAttempt(student, { lessonId: 'lesson-1' });
      expect(res.attemptId).toBe('attempt-1');
    });

    it('404s when the lesson has no PracticeContent', async () => {
      prisma.client.practiceContent.findUnique.mockResolvedValue(null);
      await expect(service.startAttempt(student, { lessonId: 'missing' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =====================================================
  // completeAttempt
  // =====================================================
  describe('completeAttempt', () => {
    const buildAttempt = (overrides: Partial<Record<string, unknown>> = {}) => ({
      id: 'attempt-1',
      studentId: student.id,
      status: ProgressStatus.IN_PROGRESS,
      practiceContent: buildPracticeContent(),
      ...overrides,
    });

    beforeEach(() => {
      prisma.client.practiceAttempt.update.mockResolvedValue({});
    });

    it('cascades to LessonProgress=COMPLETED when student passes', async () => {
      prisma.client.practiceAttempt.findUnique.mockResolvedValue(buildAttempt());

      await service.completeAttempt(student, {
        attemptId: 'attempt-1',
        duration: 180,
        stepsResult: [
          { stepId: 's1', isCorrect: true },
          { stepId: 's2', isCorrect: true },
        ],
        safetyViolations: [],
      });

      const call = prisma.client.lessonProgress.upsert.mock.calls[0][0];
      expect(call.update.status).toBe(ProgressStatus.COMPLETED);
      expect(call.update.score).toBe(100);
    });

    it('leaves LessonProgress IN_PROGRESS (no cascade) on fail', async () => {
      prisma.client.practiceAttempt.findUnique.mockResolvedValue(buildAttempt());

      const res = await service.completeAttempt(student, {
        attemptId: 'attempt-1',
        duration: 100,
        stepsResult: [{ stepId: 's1', isCorrect: true }],
        // s2 skipped → 50/100 = 50% < 70 → fail
        safetyViolations: [],
      });

      expect(res.passed).toBe(false);
      // The attempt update still fires, but NOT the LessonProgress upsert
      // because the cascade only runs on pass.
      expect(prisma.client.lessonProgress.upsert).not.toHaveBeenCalled();
    });

    it('persists score + duration + violations on complete', async () => {
      prisma.client.practiceAttempt.findUnique.mockResolvedValue(buildAttempt());

      await service.completeAttempt(student, {
        attemptId: 'attempt-1',
        duration: 245,
        stepsResult: [
          { stepId: 's1', isCorrect: true },
          { stepId: 's2', isCorrect: true },
        ],
        safetyViolations: [{ safetyId: 'helmet' }],
      });

      const call = prisma.client.practiceAttempt.update.mock.calls[0][0];
      expect(call.data.duration).toBe(245);
      expect(call.data.status).toBe(ProgressStatus.COMPLETED);
      expect(call.data.completedAt).toBeInstanceOf(Date);
      // score = 100 - 100*0.2 = 80 → round
      expect(call.data.score).toBe(80);
    });

    it('forbids completing someone elses attempt', async () => {
      prisma.client.practiceAttempt.findUnique.mockResolvedValue(
        buildAttempt({ studentId: 'another-student' }),
      );

      await expect(
        service.completeAttempt(student, {
          attemptId: 'attempt-1',
          duration: 0,
          stepsResult: [],
          safetyViolations: [],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects completing an already-completed attempt', async () => {
      prisma.client.practiceAttempt.findUnique.mockResolvedValue(
        buildAttempt({ status: ProgressStatus.COMPLETED }),
      );

      await expect(
        service.completeAttempt(student, {
          attemptId: 'attempt-1',
          duration: 0,
          stepsResult: [],
          safetyViolations: [],
        }),
      ).rejects.toThrow();
    });
  });
});
