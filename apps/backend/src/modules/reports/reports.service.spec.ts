import { CertificateStatus, Role } from '@lms/database';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../common/prisma/prisma.service';

import { ReportsService } from './reports.service';

/**
 * Unit tests for ReportsService.
 *
 * Focus: query building + filter application + format/content-type
 * selection. We do NOT unit-test pdfmake/exceljs output bytes — that's
 * library-level behaviour; we only check that exporters are invoked
 * and that the returned buffer has the right content type + filename.
 */
describe('ReportsService', () => {
  let service: ReportsService;
  let prismaMock: {
    client: {
      courseEnrollment: { findMany: jest.Mock };
      lesson: { count: jest.Mock };
      lessonProgress: { count: jest.Mock };
      quizAttempt: { findFirst: jest.Mock };
      user: { findMany: jest.Mock };
      certificate: { findMany: jest.Mock };
    };
  };

  beforeEach(async () => {
    prismaMock = {
      client: {
        courseEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
        lesson: { count: jest.fn().mockResolvedValue(0) },
        lessonProgress: { count: jest.fn().mockResolvedValue(0) },
        quizAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
        user: { findMany: jest.fn().mockResolvedValue([]) },
        certificate: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  // =====================================================
  // getProgressReport — filter building
  // =====================================================
  describe('getProgressReport', () => {
    it('applies department + date filters to enrollment query', async () => {
      await service.getProgressReport({
        departmentId: 'dept-1',
        from: '2026-01-01',
        to: '2026-04-01',
      });
      expect(prismaMock.client.courseEnrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            course: expect.objectContaining({
              subject: { departmentId: 'dept-1' },
            }),
            enrolledAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('computes progressPercent per enrollment', async () => {
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          courseId: 'c1',
          studentId: 's1',
          enrolledAt: new Date(),
          completedAt: null,
          student: { name: 'Alice', email: 'a@b.c' },
          course: { id: 'c1', title: 'Course' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(10);
      prismaMock.client.lessonProgress.count.mockResolvedValue(4);

      const result = await service.getProgressReport({});
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.progressPercent).toBe(40);
    });

    it('sets score from quiz attempt max score ratio', async () => {
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          courseId: 'c1',
          studentId: 's1',
          enrolledAt: new Date(),
          completedAt: null,
          student: { name: 'Alice', email: 'a@b.c' },
          course: { id: 'c1', title: 'Course' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(0);
      prismaMock.client.quizAttempt.findFirst.mockResolvedValue({ score: 85, maxScore: 100 });

      const result = await service.getProgressReport({});
      expect(result.rows[0]!.score).toBe(85);
    });

    it('reports truncated=true when row count hits MAX_ROWS', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        courseId: 'c1',
        studentId: `s${i}`,
        enrolledAt: new Date(),
        completedAt: null,
        student: { name: `Student ${i}`, email: `s${i}@b.c` },
        course: { id: 'c1', title: 'Course' },
      }));
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue(rows);

      const result = await service.getProgressReport({});
      expect(result.truncated).toBe(true);
      expect(result.total).toBe(1000);
    });
  });

  // =====================================================
  // exportProgressReport — format selection
  // =====================================================
  describe('exportProgressReport', () => {
    beforeEach(() => {
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          courseId: 'c1',
          studentId: 's1',
          enrolledAt: new Date('2026-03-01'),
          completedAt: new Date('2026-03-15'),
          student: { name: 'Alice', email: 'a@b.c' },
          course: { id: 'c1', title: 'Safety 101' },
        },
      ]);
      prismaMock.client.lesson.count.mockResolvedValue(5);
      prismaMock.client.lessonProgress.count.mockResolvedValue(5);
    });

    it('returns XLSX buffer with correct content type + filename', async () => {
      const result = await service.exportProgressReport('xlsx', {});
      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.filename).toMatch(/^progress-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(result.buffer.slice(0, 2).toString()).toBe('PK'); // xlsx is a zip
    });

    it('returns PDF buffer with correct content type + filename', async () => {
      const result = await service.exportProgressReport('pdf', {});
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toMatch(/^progress-\d{4}-\d{2}-\d{2}\.pdf$/);
      // PDF magic bytes: "%PDF"
      expect(result.buffer.slice(0, 4).toString()).toBe('%PDF');
    });
  });

  // =====================================================
  // exportUsers
  // =====================================================
  describe('exportUsers', () => {
    beforeEach(() => {
      prismaMock.client.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          email: 'alice@example.com',
          name: 'Alice',
          role: Role.STUDENT,
          isBlocked: false,
          emailVerified: true,
          createdAt: new Date('2026-01-01'),
        },
      ]);
    });

    it('filters by status=blocked', async () => {
      await service.exportUsers('xlsx', { status: 'blocked' });
      expect(prismaMock.client.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isBlocked: true }),
        }),
      );
    });

    it('produces XLSX with correct filename stem', async () => {
      const result = await service.exportUsers('xlsx', {});
      expect(result.filename).toMatch(/^users-\d{4}-\d{2}-\d{2}\.xlsx$/);
    });
  });

  // =====================================================
  // exportCertificates
  // =====================================================
  describe('exportCertificates', () => {
    beforeEach(() => {
      prismaMock.client.certificate.findMany.mockResolvedValue([
        {
          id: 'c1',
          code: 'CRT-001',
          status: CertificateStatus.ACTIVE,
          issuedAt: new Date('2026-03-01'),
          revokedReason: null,
          student: { name: 'Alice', email: 'a@b.c' },
          course: { title: 'Safety' },
        },
      ]);
    });

    it('builds PDF with correct content type', async () => {
      const result = await service.exportCertificates('pdf');
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toMatch(/^certificates-\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('builds XLSX with correct content type', async () => {
      const result = await service.exportCertificates('xlsx');
      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });
  });
});
