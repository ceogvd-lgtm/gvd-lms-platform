import { Role } from '@lms/types';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';

import { EnrollmentsService } from './enrollments.service';

/**
 * Phase 18 — Tests for autoEnrollByDepartment + autoEnrollAllPublished.
 *
 * Coverage:
 *   - Auto-enroll đúng student cùng department (role=STUDENT, not blocked)
 *   - Skip student đã enrolled (thông qua skipDuplicates; count = 0 khi conflict)
 *   - Skip student khác department
 *   - Skip instructor/admin (role filter)
 *   - Course không có department → return 0 (không throw)
 *   - Course không tồn tại → 404
 *   - autoEnrollAllPublished: lặp qua mọi course PUBLISHED, tổng hợp count
 */
describe('EnrollmentsService — auto-enroll (Phase 18)', () => {
  let service: EnrollmentsService;
  let prisma: {
    client: {
      course: { findUnique: jest.Mock; findMany: jest.Mock };
      user: { findMany: jest.Mock };
      courseEnrollment: { createMany: jest.Mock };
      department: { findMany: jest.Mock };
    };
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: {
        course: { findUnique: jest.fn(), findMany: jest.fn() },
        user: { findMany: jest.fn() },
        courseEnrollment: { createMany: jest.fn() },
        department: { findMany: jest.fn() },
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = mod.get(EnrollmentsService);
  });

  // =====================================================
  // autoEnrollByDepartment
  // =====================================================
  describe('autoEnrollByDepartment', () => {
    it('ghi danh đúng student của department (skipDuplicates)', async () => {
      prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'An toàn lao động',
        subject: { department: { id: 'dept-1', name: 'Kỹ thuật CN' } },
      });
      prisma.client.user.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
      prisma.client.courseEnrollment.createMany.mockResolvedValue({ count: 3 });

      const res = await service.autoEnrollByDepartment('c1');

      expect(prisma.client.user.findMany).toHaveBeenCalledWith({
        where: {
          role: Role.STUDENT,
          departmentId: 'dept-1',
          isBlocked: false,
        },
        select: { id: true },
      });
      expect(prisma.client.courseEnrollment.createMany).toHaveBeenCalledWith({
        data: [
          { courseId: 'c1', studentId: 's1' },
          { courseId: 'c1', studentId: 's2' },
          { courseId: 'c1', studentId: 's3' },
        ],
        skipDuplicates: true,
      });
      expect(res).toMatchObject({
        courseId: 'c1',
        courseTitle: 'An toàn lao động',
        departmentId: 'dept-1',
        departmentName: 'Kỹ thuật CN',
        enrolled: 3,
        skipped: 0,
        total: 3,
      });
    });

    it('skip student đã enrolled — createMany count < total', async () => {
      prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'C1',
        subject: { department: { id: 'd1', name: 'D1' } },
      });
      prisma.client.user.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
      // 1 trong 2 đã có enrollment → chỉ insert 1 row mới
      prisma.client.courseEnrollment.createMany.mockResolvedValue({ count: 1 });

      const res = await service.autoEnrollByDepartment('c1');
      expect(res.enrolled).toBe(1);
      expect(res.skipped).toBe(1);
      expect(res.total).toBe(2);
    });

    it('course không có department → return 0 (không throw)', async () => {
      prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'Course rỗng',
        subject: null,
      });
      const res = await service.autoEnrollByDepartment('c1');
      expect(prisma.client.user.findMany).not.toHaveBeenCalled();
      expect(prisma.client.courseEnrollment.createMany).not.toHaveBeenCalled();
      expect(res).toMatchObject({
        departmentId: null,
        enrolled: 0,
        skipped: 0,
        total: 0,
      });
    });

    it('department không có student → return 0', async () => {
      prisma.client.course.findUnique.mockResolvedValue({
        id: 'c1',
        title: 'C1',
        subject: { department: { id: 'd-empty', name: 'Dept rỗng' } },
      });
      prisma.client.user.findMany.mockResolvedValue([]);
      const res = await service.autoEnrollByDepartment('c1');
      expect(prisma.client.courseEnrollment.createMany).not.toHaveBeenCalled();
      expect(res.total).toBe(0);
      expect(res.enrolled).toBe(0);
    });

    it('course không tồn tại → 404', async () => {
      prisma.client.course.findUnique.mockResolvedValue(null);
      await expect(service.autoEnrollByDepartment('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // =====================================================
  // autoEnrollAllPublished (cron)
  // =====================================================
  describe('autoEnrollAllPublished', () => {
    it('lặp qua mọi course PUBLISHED + tổng hợp count', async () => {
      prisma.client.course.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      // Mock 2 lần findUnique + createMany cho 2 courses
      prisma.client.course.findUnique
        .mockResolvedValueOnce({
          id: 'c1',
          title: 'C1',
          subject: { department: { id: 'd1', name: 'D1' } },
        })
        .mockResolvedValueOnce({
          id: 'c2',
          title: 'C2',
          subject: { department: { id: 'd2', name: 'D2' } },
        });
      prisma.client.user.findMany
        .mockResolvedValueOnce([{ id: 's1' }])
        .mockResolvedValueOnce([{ id: 's2' }, { id: 's3' }]);
      prisma.client.courseEnrollment.createMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 });

      const res = await service.autoEnrollAllPublished();
      expect(res.courses).toBe(2);
      expect(res.totalEnrolled).toBe(3);
      expect(res.totalSkipped).toBe(0);
      expect(res.details).toHaveLength(2);
    });

    it('1 course fail → skip + tiếp tục với course khác', async () => {
      prisma.client.course.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      prisma.client.course.findUnique
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({
          id: 'c2',
          title: 'C2',
          subject: { department: { id: 'd2', name: 'D2' } },
        });
      prisma.client.user.findMany.mockResolvedValueOnce([{ id: 's1' }]);
      prisma.client.courseEnrollment.createMany.mockResolvedValueOnce({ count: 1 });

      const res = await service.autoEnrollAllPublished();
      expect(res.courses).toBe(2);
      expect(res.totalEnrolled).toBe(1); // chỉ c2 thành công
      expect(res.details).toHaveLength(1);
    });
  });
});
