import { Role } from '@lms/types';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminRulesService } from '../../common/rbac/admin-rules.service';

import { AdminService } from './admin.service';

/**
 * Unit tests for AdminService — covers Phase 09 additions:
 *   - listUsers with status filter
 *   - getUserDetail happy + not-found
 *   - bulkSetBlocked (success, partial failure)
 *   - exportUsers csv + xlsx
 *
 * The 4 Immutable Laws themselves are tested in
 * `common/rbac/admin-rules.service.spec.ts` — here we only verify that
 * AdminService calls into AdminRulesService at the right points.
 */
describe('AdminService — Phase 09 extensions', () => {
  let service: AdminService;
  let prismaMock: {
    client: {
      user: {
        count: jest.Mock;
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      loginLog: { findMany: jest.Mock };
      auditLog: { count: jest.Mock; findMany: jest.Mock };
    };
  };
  let rulesMock: { check: jest.Mock; checkById: jest.Mock };
  let auditMock: { log: jest.Mock };

  const ADMIN = { id: 'u-admin', role: Role.ADMIN };
  const META = { ip: '127.0.0.1' };

  beforeEach(async () => {
    prismaMock = {
      client: {
        user: {
          count: jest.fn(),
          findMany: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        loginLog: { findMany: jest.fn() },
        auditLog: { count: jest.fn(), findMany: jest.fn() },
      },
    };
    rulesMock = {
      check: jest.fn().mockResolvedValue(undefined),
      checkById: jest.fn().mockImplementation(async (_a, id) => ({ id, role: Role.STUDENT })),
    };
    auditMock = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminRulesService, useValue: rulesMock },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // =====================================================
  // listUsers — status filter
  // =====================================================
  describe('listUsers', () => {
    beforeEach(() => {
      prismaMock.client.user.count.mockResolvedValue(0);
      prismaMock.client.user.findMany.mockResolvedValue([]);
    });

    it('filters by status=active (isBlocked: false)', async () => {
      await service.listUsers({ status: 'active', page: 1, limit: 20 });
      expect(prismaMock.client.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isBlocked: false }),
        }),
      );
    });

    it('filters by status=blocked (isBlocked: true)', async () => {
      await service.listUsers({ status: 'blocked', page: 1, limit: 20 });
      expect(prismaMock.client.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isBlocked: true }),
        }),
      );
    });

    it('does not apply isBlocked filter when status is omitted', async () => {
      await service.listUsers({ page: 1, limit: 20 });
      const call = prismaMock.client.user.findMany.mock.calls[0]![0];
      expect(call.where).not.toHaveProperty('isBlocked');
    });

    it('combines q (search) + role + status filters', async () => {
      await service.listUsers({
        q: 'alice',
        role: Role.INSTRUCTOR,
        status: 'blocked',
        page: 1,
        limit: 20,
      });
      const call = prismaMock.client.user.findMany.mock.calls[0]![0];
      expect(call.where).toEqual(
        expect.objectContaining({
          role: Role.INSTRUCTOR,
          isBlocked: true,
          OR: expect.any(Array),
        }),
      );
    });
  });

  // =====================================================
  // getUserDetail
  // =====================================================
  describe('getUserDetail', () => {
    it('returns user + counts + last 5 login logs', async () => {
      prismaMock.client.user.findUnique.mockResolvedValue({
        id: 'u-1',
        email: 'a@b.c',
        name: 'Alice',
        role: Role.STUDENT,
        isBlocked: false,
        _count: {
          enrollments: 3,
          certificates: 1,
          instructedCourses: 0,
          loginLogs: 12,
        },
      });
      prismaMock.client.loginLog.findMany.mockResolvedValue([
        { id: 'l1', ipAddress: '1.1.1.1', userAgent: 'ua', success: true, createdAt: new Date() },
      ]);

      const detail = await service.getUserDetail('u-1');
      expect(detail.id).toBe('u-1');
      expect(detail._count.enrollments).toBe(3);
      expect(detail.loginHistory).toHaveLength(1);
      expect(prismaMock.client.loginLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5, where: { userId: 'u-1' } }),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      prismaMock.client.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserDetail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // =====================================================
  // bulkSetBlocked
  // =====================================================
  describe('bulkSetBlocked', () => {
    beforeEach(() => {
      prismaMock.client.user.update.mockResolvedValue({ id: 'x', isBlocked: true });
    });

    it('blocks all ids successfully and returns {ok, failed, total}', async () => {
      const result = await service.bulkSetBlocked(
        ADMIN,
        { ids: ['u1', 'u2', 'u3'], blocked: true },
        META,
      );
      expect(result.ok).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(result.total).toBe(3);
      expect(rulesMock.checkById).toHaveBeenCalledTimes(3);
      expect(auditMock.log).toHaveBeenCalledTimes(3);
    });

    it('reports partial failures when a rule check throws', async () => {
      rulesMock.checkById
        .mockResolvedValueOnce({ id: 'u1', role: Role.STUDENT })
        .mockRejectedValueOnce(
          new Error('Không thể thực hiện hành động này với tài khoản của chính mình'),
        )
        .mockResolvedValueOnce({ id: 'u3', role: Role.STUDENT });

      const result = await service.bulkSetBlocked(
        ADMIN,
        { ids: ['u1', 'u2', 'u3'], blocked: true },
        META,
      );
      expect(result.ok).toEqual(['u1', 'u3']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.id).toBe('u2');
      expect(result.failed[0]!.reason).toContain('chính mình');
    });
  });

  // =====================================================
  // exportUsers
  // =====================================================
  describe('exportUsers', () => {
    const users = [
      {
        id: 'u1',
        email: 'alice@example.com',
        name: 'Alice, the "Tester"',
        phone: '0912345678',
        role: Role.STUDENT,
        emailVerified: true,
        is2FAEnabled: false,
        isBlocked: false,
        lastLoginAt: new Date('2026-04-14T10:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    beforeEach(() => {
      prismaMock.client.user.findMany.mockResolvedValue(users);
    });

    it('produces CSV with UTF-8 BOM and escapes quotes/commas', async () => {
      const result = await service.exportUsers({ format: 'csv' });
      expect(result.contentType).toBe('text/csv; charset=utf-8');
      expect(result.filename).toMatch(/^users-\d{4}-\d{2}-\d{2}\.csv$/);

      const text = result.buffer.toString('utf8');
      // UTF-8 BOM at start so Excel reads Vietnamese correctly
      expect(text.charCodeAt(0)).toBe(0xfeff);
      // Header row
      expect(text).toContain('Email');
      // Value with comma + quote gets wrapped in quotes and quotes doubled
      expect(text).toContain('"Alice, the ""Tester"""');
      // Role
      expect(text).toContain('STUDENT');
    });

    it('produces XLSX buffer with correct content type', async () => {
      const result = await service.exportUsers({ format: 'xlsx' });
      expect(result.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result.filename).toMatch(/^users-\d{4}-\d{2}-\d{2}\.xlsx$/);
      // XLSX files are ZIP archives — magic bytes "PK"
      expect(result.buffer.slice(0, 2).toString()).toBe('PK');
      expect(result.buffer.length).toBeGreaterThan(100);
    });

    it('applies same filter as listUsers (status=blocked)', async () => {
      await service.exportUsers({ format: 'csv', status: 'blocked' });
      expect(prismaMock.client.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isBlocked: true }),
        }),
      );
    });
  });
});
