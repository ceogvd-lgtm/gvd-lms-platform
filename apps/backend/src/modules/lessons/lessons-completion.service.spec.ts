import { ProgressStatus } from '@lms/database';
import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { LessonsService } from './lessons.service';

/**
 * Unit tests for the Phase-12 lesson-completion cascade.
 *
 * Scope:
 *   - content done + quiz passed → COMPLETED
 *   - content done + quiz failed → BadRequestException
 *   - content done + no quiz → COMPLETED
 *   - content NOT done → BadRequestException
 *
 * We deliberately only cover `completeForStudent()` in this file — the
 * Phase 04 `lessons.service.spec.ts` covers ownership, reorder, etc.
 * (Actually there isn't a Phase 04 spec file; the existing coverage is
 * in admin-rules.service.spec.ts.) Keeping these assertions separate
 * keeps the file short and the intent obvious.
 */
describe('LessonsService — completeForStudent', () => {
  let service: LessonsService;
  let prisma: {
    client: {
      lesson: { findUnique: jest.Mock };
      lessonProgress: { upsert: jest.Mock; findUnique: jest.Mock };
      videoProgress: { findUnique: jest.Mock };
      quizAttempt: { aggregate: jest.Mock; findMany: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        lesson: { findUnique: jest.fn() },
        lessonProgress: { upsert: jest.fn(), findUnique: jest.fn() },
        videoProgress: { findUnique: jest.fn() },
        quizAttempt: { aggregate: jest.fn(), findMany: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = mod.get(LessonsService);
  });

  // =====================================================
  // Happy path: no quiz, content done → COMPLETED
  // =====================================================
  it('marks COMPLETED when content is done and no quiz is attached', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      id: 'lesson-1',
      isDeleted: false,
      theoryContent: {
        id: 'tc-1',
        contentType: 'VIDEO',
        completionThreshold: 0.8,
      },
      quizzes: [],
    });
    prisma.client.videoProgress.findUnique.mockResolvedValue({ isCompleted: true });
    prisma.client.lessonProgress.upsert.mockResolvedValue({
      lessonId: 'lesson-1',
      status: ProgressStatus.COMPLETED,
    });

    const row = await service.completeForStudent('student-1', 'lesson-1');
    expect(row.status).toBe(ProgressStatus.COMPLETED);
  });

  // =====================================================
  // Quiz passed → COMPLETED
  // =====================================================
  it('marks COMPLETED when content done + best attempt >= passScore', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      id: 'lesson-1',
      isDeleted: false,
      theoryContent: {
        id: 'tc-1',
        contentType: 'VIDEO',
        completionThreshold: 0.8,
      },
      quizzes: [{ id: 'quiz-1', passScore: 70 }],
    });
    prisma.client.videoProgress.findUnique.mockResolvedValue({ isCompleted: true });
    prisma.client.quizAttempt.aggregate.mockResolvedValue({ _max: { score: 85 } });
    prisma.client.lessonProgress.upsert.mockResolvedValue({
      lessonId: 'lesson-1',
      status: ProgressStatus.COMPLETED,
    });

    const row = await service.completeForStudent('student-1', 'lesson-1');
    expect(row.status).toBe(ProgressStatus.COMPLETED);
  });

  // =====================================================
  // Quiz failed → rejects
  // =====================================================
  it('rejects when content done but best quiz score < passScore', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      id: 'lesson-1',
      isDeleted: false,
      theoryContent: {
        id: 'tc-1',
        contentType: 'VIDEO',
        completionThreshold: 0.8,
      },
      quizzes: [{ id: 'quiz-1', passScore: 70 }],
    });
    prisma.client.videoProgress.findUnique.mockResolvedValue({ isCompleted: true });
    prisma.client.quizAttempt.aggregate.mockResolvedValue({ _max: { score: 40 } });

    await expect(service.completeForStudent('student-1', 'lesson-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.client.lessonProgress.upsert).not.toHaveBeenCalled();
  });

  // =====================================================
  // Content not done → rejects
  // =====================================================
  it('rejects when VIDEO content is not yet COMPLETED', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      id: 'lesson-1',
      isDeleted: false,
      theoryContent: {
        id: 'tc-1',
        contentType: 'VIDEO',
        completionThreshold: 0.8,
      },
      quizzes: [],
    });
    prisma.client.videoProgress.findUnique.mockResolvedValue({ isCompleted: false });

    await expect(service.completeForStudent('student-1', 'lesson-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  // =====================================================
  // SCORM content — checks LessonProgress.status (not VideoProgress)
  // =====================================================
  it('uses LessonProgress.status for SCORM/PPT/xAPI lessons', async () => {
    prisma.client.lesson.findUnique.mockResolvedValue({
      id: 'lesson-1',
      isDeleted: false,
      theoryContent: {
        id: 'tc-1',
        contentType: 'SCORM',
        completionThreshold: 0.8,
      },
      quizzes: [],
    });
    prisma.client.lessonProgress.findUnique.mockResolvedValue({
      status: ProgressStatus.COMPLETED,
    });
    prisma.client.lessonProgress.upsert.mockResolvedValue({
      lessonId: 'lesson-1',
      status: ProgressStatus.COMPLETED,
    });

    const row = await service.completeForStudent('student-1', 'lesson-1');
    expect(row.status).toBe(ProgressStatus.COMPLETED);
    // VideoProgress must NOT be queried for SCORM lessons.
    expect(prisma.client.videoProgress.findUnique).not.toHaveBeenCalled();
  });
});
