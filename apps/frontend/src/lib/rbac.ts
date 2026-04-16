/**
 * Client-side mirror of the 4 Immutable Laws.
 *
 * IMPORTANT: this is ONLY used to disable buttons + show tooltips explaining
 * *why* an action is forbidden. The server is the source of truth — every
 * admin endpoint re-runs the same checks in `AdminRulesService.check()`.
 *
 * Per CLAUDE.md: "Frontend: disable button + tooltip giải thích
 * (không ẩn button)." — so we ALWAYS render the button and return a disabled
 * state + reason, never hide it.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';

export type AdminAction = 'CREATE_ADMIN' | 'DELETE_USER' | 'UPDATE_ROLE' | 'BLOCK_USER';

export interface Actor {
  id: string;
  role: Role;
}

export interface Target {
  id: string;
  role: Role;
}

export interface PermissionContext {
  /** Total number of SUPER_ADMIN accounts in the system (needed for LAW 4). */
  superAdminCount?: number;
}

export interface PermissionResult {
  allowed: boolean;
  /** Vietnamese explanation — shown in tooltip when `allowed === false`. */
  reason?: string;
}

export function checkAdminRules(
  actor: Actor,
  target: Target | null,
  action: AdminAction,
  ctx: PermissionContext = {},
): PermissionResult {
  // LAW 1 — admin-privileged actions require SUPER_ADMIN.
  const isAdminPrivilegedAction =
    action === 'CREATE_ADMIN' ||
    action === 'UPDATE_ROLE' ||
    (action === 'DELETE_USER' && (target?.role === 'ADMIN' || target?.role === 'SUPER_ADMIN'));

  if (isAdminPrivilegedAction && actor.role !== 'SUPER_ADMIN') {
    return {
      allowed: false,
      reason: 'Chỉ Super Admin mới được thực hiện hành động này',
    };
  }

  if (!target) return { allowed: true };

  // LAW 2 — ADMIN cannot touch ADMIN or SUPER_ADMIN.
  if (actor.role === 'ADMIN' && (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN')) {
    return {
      allowed: false,
      reason: 'Admin không thể sửa/xoá/khoá Admin khác hoặc Super Admin',
    };
  }

  // LAW 3 — no self-destructive actions.
  if (
    actor.id === target.id &&
    (action === 'DELETE_USER' || action === 'UPDATE_ROLE' || action === 'BLOCK_USER')
  ) {
    return {
      allowed: false,
      reason: 'Không thể thực hiện hành động này với tài khoản của chính mình',
    };
  }

  // LAW 4 — last SUPER_ADMIN is untouchable.
  if (
    target.role === 'SUPER_ADMIN' &&
    (action === 'DELETE_USER' || action === 'UPDATE_ROLE') &&
    (ctx.superAdminCount ?? 2) <= 1
  ) {
    return {
      allowed: false,
      reason: 'Không thể xoá hoặc hạ cấp Super Admin duy nhất',
    };
  }

  return { allowed: true };
}
