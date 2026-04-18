import { ProgressStatus, Role } from '@lms/database';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { ProgressService } from './progress.service';

/**
 * Phase 15 — Unit tests for ProgressService.calculateCourseProgress.
 *
 * The engine has three interesting branches:
 *   - 0 lessons completed → progressPercent = 0
 *   - all lessons completed → progressPercent = 100 + completedAt stamped
 *   - partial completion → rounded percent
 *
 * We also verify a STUDENT can't peek at another student's data.
 */
describe('ProgressService', () => {
  let service: ProgressService;
  let prisma: {
    client: {
      courseEnrollment: {
        findUnique: jest.Mock;
        findMany: jest.Mock;
        findFirst: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      chapter: { findMany: jest.Mock };
      lesson: { findMany: jest.Mock };
      lessonProgress: { findMany: jest.Mock; aggregate: jest.Mock };
      course: { findUnique: jest.Mock };
    };
  };

  beforeEach(async () => {
    prisma = {
      client: {
        courseEnrollment: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        chapter: { findMany: jest.fn() },
        lesson: { findMany: jest.fn() },
        lessonProgress: { findMany: jest.fn(), aggregate: jest.fn() },
        course: { findUnique: jest.fn() },
      },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [ProgressService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ProgressService);
  });

  // =====================================================
  // calculateCourseProgress
  // =====================================================
  describe('calculateCourseProgress', () => {
    it('returns 0% when no lessons are completed', async () => {
      prisma.client.courseEnrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        completedAt: null,
      });
      prisma.client.chapter.findMany.mockResolvedValue([{ id: 'ch-1' }]);
      prisma.client.lesson.findMany.mockResolvedValue([{ id: 'l-1' }, { id: 'l-2' }]);
      prisma.client.lessonProgress.findMany.mockResolvedValue([
        { status: ProgressStatus.NOT_STARTED, score: null },
        { status: ProgressStatus.IN_PROGRESS, score: null },
      ]);

      const result = await service.calculateCourseProgress('student-1', 'course-1');

      expect(result).toEqual({ progressPercent: 0, completed: false });
      const updateCall = prisma.client.courseEnrollment.update.mock.calls[0]![0];
      expect(updateCall.data.progressPercent).toBe(0);
      // lastActiveAt should always be bumped
      expect(updateCall.data.lastActiveAt).toBeInstanceOf(Date);
      // completedAt should NOT be stamped when still not done
      expect(updateCall.data.completedAt).toBeUndefined();
    });

    it('returns 100% and stamps completedAt when all lessons are COMPLETED', async () => {
      prisma.client.courseEnrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        completedAt: null,
      });
      prisma.client.chapter.findMany.mockResolvedValue([{ id: 'ch-1' }]);
      prisma.client.lesson.findMany.mockResolvedValue([
        { id: 'l-1' },
        { id: 'l-2' },
        { id: 'l-3' },
      ]);
      prisma.client.lessonProgress.findMany.mockResolvedValue([
        { status: ProgressStatus.COMPLETED, score: 85 },
        { status: ProgressStatus.COMPLETED, score: 90 },
        { status: ProgressStatus.COMPLETED, score: 75 },
      ]);

      const result = await service.calculateCourseProgress('student-1', 'course-1');

      expect(result).toEqual({ progressPercent: 100, completed: true });
      const updateCall = prisma.client.courseEnrollment.update.mock.calls[0]![0];
      expect(updateCall.data.progressPercent).toBe(100);
      expect(updateCall.data.completedAt).toBeInstanceOf(Date);
    });

    it('does NOT re-stamp completedAt if it was already set (idempotent)', async () => {
      const originalCompleted = new Date('2026-01-01');
      prisma.client.courseEnrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        completedAt: originalCompleted,
      });
      prisma.client.chapter.findMany.mockResolvedValue([{ id: 'ch-1' }]);
      prisma.client.lesson.findMany.mockResolvedValue([{ id: 'l-1' }]);
      prisma.client.lessonProgress.findMany.mockResolvedValue([
        { status: ProgressStatus.COMPLETED, score: 100 },
      ]);

      await service.calculateCourseProgress('student-1', 'course-1');

      const updateCall = prisma.client.courseEnrollment.update.mock.calls[0]![0];
      // Should not overwrite — spec: "set completedAt khi 100%" (only on first transition)
      expect(updateCall.data.completedAt).toBeUndefined();
    });

    it('returns 0% gracefully when enrollment does not exist', async () => {
      prisma.client.courseEnrollment.findUnique.mockResolvedValue(null);

      const result = await service.calculateCourseProgress('student-1', 'course-1');

      expect(result).toEqual({ progressPercent: 0, completed: false });
      expect(prisma.client.courseEnrollment.update).not.toHaveBeenCalled();
    });

    it('computes partial percent and rounds correctly (1 of 3 = 33%)', async () => {
      prisma.client.courseEnrollment.findUnique.mockResolvedValue({
        id: 'enr-1',
        completedAt: null,
      });
      prisma.client.chapter.findMany.mockResolvedValue([{ id: 'ch-1' }]);
      prisma.client.lesson.findMany.mockResolvedValue([
        { id: 'l-1' },
        { id: 'l-2' },
        { id: 'l-3' },
      ]);
      prisma.client.lessonProgress.findMany.mockResolvedValue([
        { status: ProgressStatus.COMPLETED, score: 80 },
        { status: ProgressStatus.IN_PROGRESS, score: null },
      ]);

      const result = await service.calculateCourseProgress('student-1', 'course-1');
      expect(result.progressPercent).toBe(33);
      expect(result.completed).toBe(false);
    });
  });

  // =====================================================
  // Authz — assertStudentReadable via getStudentCourses
  // =====================================================
  describe('authz', () => {
    it('STUDENT can read own data', async () => {
      prisma.client.courseEnrollment.findMany.mockResolvedValue([]);
      await expect(
        service.getStudentCourses({ id: 'u1', role: Role.STUDENT }, 'u1'),
      ).resolves.toEqual([]);
    });

    it('STUDENT cannot read other students data', async () => {
      await expect(
        service.getStudentCourses({ id: 'u1', role: Role.STUDENT }, 'u2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('INSTRUCTOR can read if they share a course with the student', async () => {
      prisma.client.courseEnrollment.findFirst.mockResolvedValue({ id: 'shared' });
      prisma.client.courseEnrollment.findMany.mockResolvedValue([]);
      await expect(
        service.getStudentCourses({ id: 'instr-1', role: Role.INSTRUCTOR }, 'student-1'),
      ).resolves.toEqual([]);
    });

    it('INSTRUCTOR is rejected for a student they do not share a course with', async () => {
      prisma.client.courseEnrollment.findFirst.mockResolvedValue(null);
      await expect(
        service.getStudentCourses({ id: 'instr-1', role: Role.INSTRUCTOR }, 'student-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN can read any student (no shared-course check)', async () => {
      prisma.client.courseEnrollment.findMany.mockResolvedValue([]);
      await expect(
        service.getStudentCourses({ id: 'admin-1', role: Role.ADMIN }, 'student-1'),
      ).resolves.toEqual([]);
      expect(prisma.client.courseEnrollment.findFirst).not.toHaveBeenCalled();
    });
  });
});
