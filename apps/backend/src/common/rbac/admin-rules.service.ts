import { Role } from '@lms/types';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * High-level action taxonomy that the 4 Immutable Laws check against.
 *
 *   CREATE_ADMIN      — creating a new ADMIN-level account
 *   DELETE_USER       — deleting any user (soft or hard)
 *   UPDATE_ROLE       — changing a user's role
 *   BLOCK_USER        — toggling isBlocked on a user
 *   UPDATE_USER       — Phase 18: gán department cho user khác (non-privileged,
 *                       follows LAW 2: ADMIN không được sửa ADMIN/SUPER_ADMIN khác)
 */
export type AdminAction =
  | 'CREATE_ADMIN'
  | 'DELETE_USER'
  | 'UPDATE_ROLE'
  | 'BLOCK_USER'
  | 'UPDATE_USER';

export interface AdminActor {
  id: string;
  role: Role;
}

export interface AdminTarget {
  id: string;
  role: Role;
}

/**
 * Enforces the 4 Immutable Laws for admin operations (CLAUDE.md).
 *
 * These laws MUST be checked on the server for every admin action — the
 * frontend only uses the same logic to disable buttons + show tooltips.
 *
 * LAW 1: Only SUPER_ADMIN can CREATE_ADMIN / DELETE_ADMIN / UPDATE_ADMIN_ROLE
 * LAW 2: ADMIN cannot touch another ADMIN or a SUPER_ADMIN
 * LAW 3: Nobody can delete their own account
 * LAW 4: Cannot delete/demote the last remaining SUPER_ADMIN
 */
@Injectable()
export class AdminRulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check all laws against a (actor, target, action) triple.
   * Throws `ForbiddenException` with the appropriate Vietnamese message if
   * any law is violated.
   *
   * Pass `target = null` for actions that don't have a target user yet
   * (e.g. CREATE_ADMIN pre-creation). Law 2/3/4 are skipped in that case;
   * Law 1 still applies via the `action` argument.
   */
  async check(actor: AdminActor, target: AdminTarget | null, action: AdminAction): Promise<void> {
    // LAW 1 — admin-privileged actions require SUPER_ADMIN.
    // These three actions can only be performed by SUPER_ADMIN regardless of
    // the target's role. For BLOCK_USER we fall through to LAW 2 (ADMIN can
    // block a STUDENT/INSTRUCTOR but not another ADMIN).
    const isAdminPrivilegedAction =
      action === 'CREATE_ADMIN' ||
      action === 'UPDATE_ROLE' ||
      (action === 'DELETE_USER' &&
        (target?.role === Role.ADMIN || target?.role === Role.SUPER_ADMIN));

    if (isAdminPrivilegedAction && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    if (!target) return;

    // LAW 2 — ADMIN cannot touch another ADMIN or SUPER_ADMIN.
    if (
      actor.role === Role.ADMIN &&
      (target.role === Role.ADMIN || target.role === Role.SUPER_ADMIN)
    ) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    // LAW 3 — no self-destructive actions.
    if (
      actor.id === target.id &&
      (action === 'DELETE_USER' || action === 'UPDATE_ROLE' || action === 'BLOCK_USER')
    ) {
      throw new ForbiddenException(
        'Không thể thực hiện hành động này với tài khoản của chính mình',
      );
    }

    // LAW 4 — last SUPER_ADMIN is untouchable.
    if (
      target.role === Role.SUPER_ADMIN &&
      (action === 'DELETE_USER' || action === 'UPDATE_ROLE')
    ) {
      const count = await this.prisma.client.user.count({
        where: { role: Role.SUPER_ADMIN },
      });
      if (count <= 1) {
        throw new ForbiddenException('Không thể xoá Super Admin duy nhất');
      }
    }
  }

  /**
   * Load a target user by id and hand it to `check()` in one step.
   * Convenience wrapper used by most controllers so they don't repeat the
   * findUnique + NotFound pattern.
   */
  async checkById(
    actor: AdminActor,
    targetId: string,
    action: AdminAction,
  ): Promise<{ id: string; role: Role }> {
    const target = await this.prisma.client.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });
    if (!target) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    await this.check(actor, target, action);
    return target;
  }
}
