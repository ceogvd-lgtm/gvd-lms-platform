import { Role } from '@lms/types';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../../common/prisma/prisma.service';

import { DashboardService } from './dashboard.service';

/**
 * Unit tests for DashboardService.
 *
 * These tests don't hit a real database — they mock PrismaService and
 * verify each aggregation method:
 *   - returns the right response shape
 *   - parameter clamping (months, limit) works
 *   - delta% math handles zero-division
 *   - activity feed merges + sorts + slices
 */
describe('DashboardService', () => {
  let service: DashboardService;
  let prismaMock: {
    client: {
      user: {
        count: jest.Mock;
        findMany: jest.Mock;
        groupBy: jest.Mock;
      };
      course: {
        count: jest.Mock;
        findMany: jest.Mock;
      };
      certificate: {
        count: jest.Mock;
      };
      auditLog: { findMany: jest.Mock };
      loginLog: { findMany: jest.Mock };
      courseEnrollment: { findMany: jest.Mock };
    };
  };

  beforeEach(async () => {
    prismaMock = {
      client: {
        user: {
          count: jest.fn(),
          findMany: jest.fn(),
          groupBy: jest.fn(),
        },
        course: {
          count: jest.fn(),
          findMany: jest.fn(),
        },
        certificate: {
          count: jest.fn(),
        },
        auditLog: { findMany: jest.fn().mockResolvedValue([]) },
        loginLog: { findMany: jest.fn().mockResolvedValue([]) },
        courseEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  // =====================================================
  // KPI
  // =====================================================
  describe('getKpi', () => {
    it('returns 4 KPI values with delta percentages', async () => {
      prismaMock.client.user.count
        .mockResolvedValueOnce(100) // totalUsers
        .mockResolvedValueOnce(80) // usersLastMonth
        .mockResolvedValueOnce(20) // activeToday
        .mockResolvedValueOnce(15); // activeYesterday
      prismaMock.client.course.count
        .mockResolvedValueOnce(25) // totalCourses
        .mockResolvedValueOnce(20); // coursesLastMonth
      prismaMock.client.certificate.count
        .mockResolvedValueOnce(50) // certificatesActive
        .mockResolvedValueOnce(40); // certsLastMonth

      const kpi = await service.getKpi();

      expect(kpi.totalUsers).toEqual({ value: 100, deltaPct: 25 });
      expect(kpi.activeToday).toEqual({ value: 20, deltaPct: 33 });
      expect(kpi.totalCourses).toEqual({ value: 25, deltaPct: 25 });
      expect(kpi.certificatesIssued).toEqual({ value: 50, deltaPct: 25 });
    });

    it('handles zero baseline (previous=0) without dividing by zero', async () => {
      prismaMock.client.user.count
        .mockResolvedValueOnce(5) // totalUsers
        .mockResolvedValueOnce(0) // usersLastMonth → zero baseline
        .mockResolvedValueOnce(0) // activeToday
        .mockResolvedValueOnce(0); // activeYesterday → 0/0 → 0
      prismaMock.client.course.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prismaMock.client.certificate.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const kpi = await service.getKpi();

      expect(kpi.totalUsers).toEqual({ value: 5, deltaPct: 100 });
      expect(kpi.activeToday).toEqual({ value: 0, deltaPct: 0 });
      expect(kpi.totalCourses).toEqual({ value: 0, deltaPct: 0 });
      expect(kpi.certificatesIssued).toEqual({ value: 0, deltaPct: 0 });
    });

    it('returns negative deltaPct when metric drops month over month', async () => {
      prismaMock.client.user.count
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      prismaMock.client.course.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      prismaMock.client.certificate.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const kpi = await service.getKpi();
      expect(kpi.totalUsers.deltaPct).toBe(-20);
    });
  });

  // =====================================================
  // REGISTRATIONS
  // =====================================================
  describe('getRegistrations', () => {
    it('buckets users by month and returns a point per month', async () => {
      const now = new Date();
      const d1 = new Date(now.getFullYear(), now.getMonth(), 10);
      const d2 = new Date(now.getFullYear(), now.getMonth(), 15);
      const d3 = new Date(now.getFullYear(), now.getMonth() - 1, 5);
      prismaMock.client.user.findMany.mockResolvedValue([
        { createdAt: d1 },
        { createdAt: d2 },
        { createdAt: d3 },
      ]);

      const result = await service.getRegistrations(3);
      expect(result.points).toHaveLength(3);
      // Most recent bucket should have 2 users, previous month should have 1
      const currentMonth = result.points[result.points.length - 1]!;
      const lastMonth = result.points[result.points.length - 2]!;
      expect(currentMonth.count).toBe(2);
      expect(lastMonth.count).toBe(1);
    });

    it('clamps months to max 24 and min 1', async () => {
      prismaMock.client.user.findMany.mockResolvedValue([]);

      const big = await service.getRegistrations(999);
      expect(big.points).toHaveLength(24);

      const tiny = await service.getRegistrations(0);
      expect(tiny.points).toHaveLength(1);
    });
  });

  // =====================================================
  // TOP COURSES
  // =====================================================
  describe('getTopCourses', () => {
    it('returns courses sorted by enrollment count with clamped limit', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([
        { id: 'c1', title: 'A', thumbnailUrl: null, _count: { enrollments: 10 } },
        { id: 'c2', title: 'B', thumbnailUrl: '/b.jpg', _count: { enrollments: 5 } },
      ]);

      const res = await service.getTopCourses(10);
      expect(res.courses).toHaveLength(2);
      expect(res.courses[0]).toEqual({
        id: 'c1',
        title: 'A',
        thumbnailUrl: null,
        enrollmentCount: 10,
      });
      expect(prismaMock.client.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('clamps limit to [1, 20]', async () => {
      prismaMock.client.course.findMany.mockResolvedValue([]);
      await service.getTopCourses(100);
      expect(prismaMock.client.course.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20 }),
      );
    });
  });

  // =====================================================
  // ROLE DISTRIBUTION
  // =====================================================
  describe('getRoleDistribution', () => {
    it('maps groupBy output into slices array', async () => {
      prismaMock.client.user.groupBy.mockResolvedValue([
        { role: Role.STUDENT, _count: { _all: 120 } },
        { role: Role.INSTRUCTOR, _count: { _all: 10 } },
        { role: Role.ADMIN, _count: { _all: 3 } },
      ]);

      const res = await service.getRoleDistribution();
      expect(res.slices).toEqual([
        { role: Role.STUDENT, count: 120 },
        { role: Role.INSTRUCTOR, count: 10 },
        { role: Role.ADMIN, count: 3 },
      ]);
    });
  });

  // =====================================================
  // ACTIVITY FEED
  // =====================================================
  describe('getActivityFeed', () => {
    it('merges audit + login + enrollment and sorts desc by timestamp', async () => {
      const t1 = new Date('2026-04-15T10:00:00Z');
      const t2 = new Date('2026-04-15T09:00:00Z');
      const t3 = new Date('2026-04-15T08:00:00Z');

      prismaMock.client.auditLog.findMany.mockResolvedValue([
        {
          id: 'a1',
          action: 'ADMIN_CREATE_ADMIN',
          targetType: 'User',
          targetId: 'u-123',
          createdAt: t2,
          user: { id: 'u1', name: 'Super', role: Role.SUPER_ADMIN },
        },
      ]);
      prismaMock.client.loginLog.findMany.mockResolvedValue([
        {
          id: 'l1',
          createdAt: t1,
          user: { id: 'u2', name: 'Instr', role: Role.INSTRUCTOR },
        },
      ]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([
        {
          id: 'e1',
          enrolledAt: t3,
          student: { id: 'u3', name: 'Stu', role: Role.STUDENT },
          course: { id: 'c1', title: 'Safety 101' },
        },
      ]);

      const res = await service.getActivityFeed(10);
      expect(res.items).toHaveLength(3);
      expect(res.items[0]!.type).toBe('LOGIN'); // t1 newest
      expect(res.items[1]!.type).toBe('AUDIT'); // t2
      expect(res.items[2]!.type).toBe('ENROLL'); // t3 oldest
    });

    it('respects limit after merge', async () => {
      prismaMock.client.auditLog.findMany.mockResolvedValue([
        {
          id: 'a1',
          action: 'X',
          targetType: 'U',
          targetId: 'xx',
          createdAt: new Date(),
          user: { id: 'u', name: 'n', role: Role.ADMIN },
        },
        {
          id: 'a2',
          action: 'X',
          targetType: 'U',
          targetId: 'yy',
          createdAt: new Date(),
          user: { id: 'u', name: 'n', role: Role.ADMIN },
        },
      ]);
      prismaMock.client.loginLog.findMany.mockResolvedValue([]);
      prismaMock.client.courseEnrollment.findMany.mockResolvedValue([]);

      const res = await service.getActivityFeed(1);
      expect(res.items).toHaveLength(1);
    });
  });

  // =====================================================
  // ALERTS
  // =====================================================
  describe('getAlerts', () => {
    it('returns counts + recent pending items', async () => {
      prismaMock.client.user.count.mockResolvedValueOnce(7); // inactiveStudents
      prismaMock.client.course.count.mockResolvedValueOnce(3); // pendingCourses
      prismaMock.client.course.findMany.mockResolvedValueOnce([
        {
          id: 'c1',
          title: 'Course A',
          createdAt: new Date('2026-04-10'),
          instructor: { id: 'i1', name: 'Instr A' },
        },
      ]);

      const alerts = await service.getAlerts();
      expect(alerts.inactiveStudents).toBe(7);
      expect(alerts.pendingCourses).toBe(3);
      expect(alerts.pendingItems).toHaveLength(1);
      expect(alerts.pendingItems[0]!.instructorName).toBe('Instr A');
    });
  });
});
