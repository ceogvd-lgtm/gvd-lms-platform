import { Role } from '@lms/types';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AdminRulesService } from './admin-rules.service';

/**
 * Unit tests for the 4 Immutable Laws.
 *
 * These are the most security-critical tests in the project — every scenario
 * here corresponds directly to one of the laws in CLAUDE.md. Do NOT remove
 * or weaken any case without explicit authorization.
 */
describe('AdminRulesService — 4 Immutable Laws', () => {
  let service: AdminRulesService;
  let prismaMock: {
    client: {
      user: {
        count: jest.Mock;
        findUnique: jest.Mock;
      };
    };
  };

  const SUPER = { id: 'u-super', role: Role.SUPER_ADMIN };
  const SUPER2 = { id: 'u-super-2', role: Role.SUPER_ADMIN };
  const ADMIN_A = { id: 'u-admin-a', role: Role.ADMIN };
  const ADMIN_B = { id: 'u-admin-b', role: Role.ADMIN };
  const INSTR = { id: 'u-instr', role: Role.INSTRUCTOR };
  const STUDENT = { id: 'u-stud', role: Role.STUDENT };

  beforeEach(async () => {
    prismaMock = {
      client: {
        user: {
          count: jest.fn().mockResolvedValue(2), // default: 2 super admins
          findUnique: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminRulesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<AdminRulesService>(AdminRulesService);
  });

  // =====================================================
  // LAW 1 — Chỉ SUPER_ADMIN gọi được CREATE_ADMIN / DELETE_ADMIN / UPDATE_ROLE
  // =====================================================
  describe('LAW 1 — admin-privileged actions require SUPER_ADMIN', () => {
    it('SUPER_ADMIN can CREATE_ADMIN', async () => {
      await expect(service.check(SUPER, null, 'CREATE_ADMIN')).resolves.toBeUndefined();
    });

    it('ADMIN cannot CREATE_ADMIN', async () => {
      await expect(service.check(ADMIN_A, null, 'CREATE_ADMIN')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('INSTRUCTOR cannot CREATE_ADMIN', async () => {
      await expect(service.check(INSTR, null, 'CREATE_ADMIN')).rejects.toThrow(ForbiddenException);
    });

    it('SUPER_ADMIN can DELETE an ADMIN', async () => {
      await expect(service.check(SUPER, ADMIN_B, 'DELETE_USER')).resolves.toBeUndefined();
    });

    it('ADMIN cannot DELETE another ADMIN (also covered by LAW 2)', async () => {
      await expect(service.check(ADMIN_A, ADMIN_B, 'DELETE_USER')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SUPER_ADMIN can UPDATE_ROLE of anyone', async () => {
      await expect(service.check(SUPER, INSTR, 'UPDATE_ROLE')).resolves.toBeUndefined();
      await expect(service.check(SUPER, STUDENT, 'UPDATE_ROLE')).resolves.toBeUndefined();
    });

    it('ADMIN cannot UPDATE_ROLE of anyone (LAW 1)', async () => {
      await expect(service.check(ADMIN_A, STUDENT, 'UPDATE_ROLE')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =====================================================
  // LAW 2 — ADMIN cố sửa/xoá SUPER_ADMIN hoặc ADMIN khác → 403
  // =====================================================
  describe('LAW 2 — ADMIN cannot touch ADMIN or SUPER_ADMIN', () => {
    it('ADMIN cannot DELETE another ADMIN', async () => {
      await expect(service.check(ADMIN_A, ADMIN_B, 'DELETE_USER')).rejects.toThrow(
        /không có quyền/i,
      );
    });

    it('ADMIN cannot DELETE a SUPER_ADMIN', async () => {
      await expect(service.check(ADMIN_A, SUPER, 'DELETE_USER')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ADMIN cannot BLOCK another ADMIN', async () => {
      await expect(service.check(ADMIN_A, ADMIN_B, 'BLOCK_USER')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ADMIN CAN BLOCK a STUDENT (LAW 2 does not apply to non-admin targets)', async () => {
      await expect(service.check(ADMIN_A, STUDENT, 'BLOCK_USER')).resolves.toBeUndefined();
    });

    it('ADMIN CAN BLOCK an INSTRUCTOR', async () => {
      await expect(service.check(ADMIN_A, INSTR, 'BLOCK_USER')).resolves.toBeUndefined();
    });

    it('ADMIN CAN DELETE a STUDENT', async () => {
      await expect(service.check(ADMIN_A, STUDENT, 'DELETE_USER')).resolves.toBeUndefined();
    });
  });

  // =====================================================
  // LAW 3 — Tự xoá chính mình → 403
  // =====================================================
  describe('LAW 3 — no self-destructive actions', () => {
    it('SUPER_ADMIN cannot DELETE themselves', async () => {
      // The super-admin count is 2 so LAW 4 does NOT kick in — any failure
      // here is LAW 3 alone.
      await expect(service.check(SUPER, SUPER, 'DELETE_USER')).rejects.toThrow(/chính mình/);
    });

    it('SUPER_ADMIN cannot UPDATE_ROLE of themselves', async () => {
      await expect(service.check(SUPER, SUPER, 'UPDATE_ROLE')).rejects.toThrow(/chính mình/);
    });

    it('SUPER_ADMIN cannot BLOCK themselves', async () => {
      await expect(service.check(SUPER, SUPER, 'BLOCK_USER')).rejects.toThrow(/chính mình/);
    });

    it('ADMIN cannot BLOCK themselves', async () => {
      // LAW 2 also triggers (ADMIN vs ADMIN). Verify the error is thrown
      // regardless of which law wins — the user-facing contract is "403".
      await expect(service.check(ADMIN_A, ADMIN_A, 'BLOCK_USER')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =====================================================
  // LAW 4 — Xoá Super Admin duy nhất → 403
  // =====================================================
  describe('LAW 4 — last SUPER_ADMIN is untouchable', () => {
    it('SUPER_ADMIN cannot DELETE the only SUPER_ADMIN (themself)', async () => {
      // 1 super admin in DB + self-action → LAW 3 wins first.
      prismaMock.client.user.count.mockResolvedValueOnce(1);
      await expect(service.check(SUPER, SUPER, 'DELETE_USER')).rejects.toThrow(ForbiddenException);
    });

    it('SUPER_ADMIN cannot DELETE another SUPER_ADMIN when only 1 remains', async () => {
      // Artificial but important: 2nd actor deleting the "last" super admin.
      // In reality count reflects current DB state so if actor is SUPER_ADMIN
      // there are >= 1 super admins. We mock count=1 to simulate the edge.
      prismaMock.client.user.count.mockResolvedValueOnce(1);
      await expect(service.check(SUPER, SUPER2, 'DELETE_USER')).rejects.toThrow(/duy nhất/);
    });

    it('SUPER_ADMIN CAN DELETE another SUPER_ADMIN when count >= 2', async () => {
      prismaMock.client.user.count.mockResolvedValueOnce(2);
      await expect(service.check(SUPER, SUPER2, 'DELETE_USER')).resolves.toBeUndefined();
    });

    it('SUPER_ADMIN cannot UPDATE_ROLE of last SUPER_ADMIN (demotion)', async () => {
      prismaMock.client.user.count.mockResolvedValueOnce(1);
      await expect(service.check(SUPER, SUPER2, 'UPDATE_ROLE')).rejects.toThrow(/duy nhất/);
    });
  });

  // =====================================================
  // checkById — not-found path
  // =====================================================
  describe('checkById', () => {
    it('throws NotFound when target user does not exist', async () => {
      prismaMock.client.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.checkById(SUPER, 'nonexistent', 'DELETE_USER')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns target and succeeds when allowed', async () => {
      prismaMock.client.user.findUnique.mockResolvedValueOnce(STUDENT);
      const t = await service.checkById(SUPER, STUDENT.id, 'DELETE_USER');
      expect(t).toEqual(STUDENT);
    });
  });
});
