import { Role } from '@lms/database';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../../common/audit/audit.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EmailService } from '../../notifications/email.service';

import { InstructorAnalyticsService } from './analytics.service';

describe('InstructorAnalyticsService', () => {
  let service: InstructorAnalyticsService;
  let prismaMock: {
    client: {
      course: { findMany: jest.Mock };
      courseEnrollment: { findMany: jest.Mock; findFirst: jest.Mock };
      lesson: { count: jest.Mock; findMany: jest.Mock };
      lessonProgress: {
        findFirst: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
        aggregate: jest.Mock;
      };
    };
  };
  let emailMock: { sendAtRiskAlert: jest.Mock };
  let auditMock: { log: jest.Mock };

  const INSTR = { id: 'u-instr', role: Role.INSTRUCTOR };
  const META = { ip: '127.0.0.1' };

  beforeEach(async () => {
    prismaMock = {
      client: {
        course: { findMany: jest.fn() },
        courseEnrollment: { findMany: jest.fn(), findFirst: jest.fn() },
        lesson: { count: jest.fn(), findMany: jest.fn() },
        lessonProgress: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          aggregate: jest.fn(),
        },
      },
    };
    emailMock = { sendAtRiskAlert: jest.fn().mockResolvedValue({ jobId: 'j-1' }) };
    auditMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstructorAnalyticsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: EmailService, useValue: emailMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    service = module.get(InstructorAnalyticsService);
  });

  // =====================================================
  // listStudents — status classification
  // =====================================================
  describe('listStudents', () => {
    it('returns empty when instructor owns no courses', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([]);
      const result = await service.listStudents(INSTR, { page: 1, limit: 20 });
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('rejects when courseId is not owned by actor', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'mine' }]);
      await expect(
        service.listStudents(INSTR, { courseId: 'other-course', page: 1, limit: 20 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('classifies status: completed', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          studentId: 's1',
          courseId: 'c1',
          enrolledAt: eightDaysAgo,
          completedAt: new Date(),
          student: { id: 's1', name: 'A', email: 'a@b.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.findFirst.mockResolvedValue({
        lastViewAt: new Date(),
      });
      prismaMock.client.lessonProgress.aggregate.mockResolvedValue({ _avg: { score: 90 } });

      const result = await service.listStudents(INSTR, { page: 1, limit: 20 });
      expect(result.data[0]!.status).toBe('completed');
      expect(result.data[0]!.progressPercent).toBe(100);
      expect(result.data[0]!.avgScore).toBe(90);
    });

    it('classifies status: not-started when progress is 0', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          studentId: 's1',
          courseId: 'c1',
          enrolledAt: new Date(),
          completedAt: null,
          student: { id: 's1', name: 'A', email: 'a@b.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.count.mockResolvedValue(0);
      prismaMock.client.lessonProgress.findFirst.mockResolvedValue(null);
      prismaMock.client.lessonProgress.aggregate.mockResolvedValue({ _avg: { score: null } });

      const result = await service.listStudents(INSTR, { page: 1, limit: 20 });
      expect(result.data[0]!.status).toBe('not-started');
    });

    it('classifies status: at-risk when progress < 30 and inactive > 7 days', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          studentId: 's1',
          courseId: 'c1',
          enrolledAt: new Date(),
          completedAt: null,
          student: { id: 's1', name: 'A', email: 'a@b.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.count.mockResolvedValue(2); // 20%
      prismaMock.client.lessonProgress.findFirst.mockResolvedValue({
        lastViewAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });
      prismaMock.client.lessonProgress.aggregate.mockResolvedValue({ _avg: { score: 40 } });

      const result = await service.listStudents(INSTR, { page: 1, limit: 20 });
      expect(result.data[0]!.status).toBe('at-risk');
    });

    it('classifies status: in-progress otherwise', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          studentId: 's1',
          courseId: 'c1',
          enrolledAt: new Date(),
          completedAt: null,
          student: { id: 's1', name: 'A', email: 'a@b.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.count.mockResolvedValue(5); // 50%
      prismaMock.client.lessonProgress.findFirst.mockResolvedValue({ lastViewAt: new Date() });
      prismaMock.client.lessonProgress.aggregate.mockResolvedValue({ _avg: { score: 65 } });

      const result = await service.listStudents(INSTR, { page: 1, limit: 20 });
      expect(result.data[0]!.status).toBe('in-progress');
    });

    it('filters at-risk only', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          studentId: 's1',
          courseId: 'c1',
          enrolledAt: new Date(),
          completedAt: null,
          student: { id: 's1', name: 'A', email: 'a@b.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
        {
          id: 'e2',
          studentId: 's2',
          courseId: 'c1',
          enrolledAt: new Date(),
          completedAt: new Date(),
          student: { id: 's2', name: 'B', email: 'b@b.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      // s1 → 20%, inactive 10d → at-risk; s2 → 100%, completed → completed
      prismaMock.client.lessonProgress.count.mockResolvedValueOnce(2).mockResolvedValueOnce(10);
      prismaMock.client.lessonProgress.findFirst
        .mockResolvedValueOnce({ lastViewAt: new Date(Date.now() - 10 * 86400000) })
        .mockResolvedValueOnce({ lastViewAt: new Date() });
      prismaMock.client.lessonProgress.aggregate
        .mockResolvedValueOnce({ _avg: { score: 40 } })
        .mockResolvedValueOnce({ _avg: { score: 90 } });

      const result = await service.listStudents(INSTR, {
        filter: 'at-risk',
        page: 1,
        limit: 20,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.studentId).toBe('s1');
    });
  });

  // =====================================================
  // sendReminder
  // =====================================================
  describe('sendReminder', () => {
    it('rejects when courseId not owned', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      await expect(
        service.sendReminder(INSTR, { courseId: 'other', studentIds: ['s1'] }, META),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enqueues at-risk-alert email per student and writes audit', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          studentId: 's1',
          enrolledAt: new Date(Date.now() - 10 * 86400000),
          student: { id: 's1', name: 'A', email: 'a@b.c' },
          course: { id: 'c1', title: 'Safety' },
        },
        {
          studentId: 's2',
          enrolledAt: new Date(Date.now() - 5 * 86400000),
          student: { id: 's2', name: 'B', email: 'b@b.c' },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lessonProgress.findFirst.mockResolvedValue(null);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.count.mockResolvedValue(1);

      const result = await service.sendReminder(
        INSTR,
        { courseId: 'c1', studentIds: ['s1', 's2'] },
        META,
      );
      expect(result.sent).toEqual(['s1', 's2']);
      expect(emailMock.sendAtRiskAlert).toHaveBeenCalledTimes(2);
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INSTRUCTOR_SEND_REMINDER',
          targetId: 'c1',
        }),
      );
    });

    it('records partial failures when email enqueue throws', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          studentId: 's1',
          enrolledAt: new Date(),
          student: { id: 's1', name: 'A', email: 'a@b.c' },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lessonProgress.findFirst.mockResolvedValue(null);
      prismaMock.client.lesson.count.mockResolvedValue(0);
      prismaMock.client.lessonProgress.count.mockResolvedValue(0);
      emailMock.sendAtRiskAlert.mockRejectedValueOnce(new Error('Queue down'));

      const result = await service.sendReminder(
        INSTR,
        { courseId: 'c1', studentIds: ['s1'] },
        META,
      );
      expect(result.sent).toEqual([]);
      expect(result.failed[0]!.studentId).toBe('s1');
      expect(result.failed[0]!.reason).toContain('Queue down');
    });
  });

  // =====================================================
  // exportCsv — content-type + UTF-8 BOM + filename
  // =====================================================
  describe('exportCsv', () => {
    it('returns CSV with UTF-8 BOM and proper content type', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([{ id: 'c1' }]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          studentId: 's1',
          courseId: 'c1',
          enrolledAt: new Date('2026-01-01'),
          completedAt: null,
          student: { id: 's1', name: 'Alice, "the tester"', email: 'a@b.c', avatar: null },
          course: { id: 'c1', title: 'Safety' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.count.mockResolvedValue(3);
      prismaMock.client.lessonProgress.findFirst.mockResolvedValue({ lastViewAt: new Date() });
      prismaMock.client.lessonProgress.aggregate.mockResolvedValue({ _avg: { score: 50 } });

      const result = await service.exportCsv(INSTR, { format: 'csv' });
      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toMatch(/^students-\d{4}-\d{2}-\d{2}\.csv$/);
      const text = result.buffer.toString('utf8');
      expect(text.charCodeAt(0)).toBe(0xfeff);
      // CSV escapes quotes via doubling and wraps in quotes
      expect(text).toContain('"Alice, ""the tester"""');
    });
  });
});
