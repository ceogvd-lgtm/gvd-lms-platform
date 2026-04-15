'use client';

import { cn } from '@lms/ui';
import * as React from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import {
  checkAdminRules,
  type Actor,
  type AdminAction,
  type PermissionContext,
  type Target,
} from '@/lib/rbac';

interface UserActionButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'disabled'
> {
  actor: Actor;
  target: Target;
  action: AdminAction;
  ctx?: PermissionContext;
  variant?: 'danger' | 'primary' | 'secondary';
}

const VARIANT: Record<NonNullable<UserActionButtonProps['variant']>, string> = {
  danger:
    'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40',
  primary:
    'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/40',
  secondary:
    'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
};

/**
 * Button that automatically disables itself + shows a tooltip explaining WHY
 * when the (actor, target, action) triple violates one of the 4 Immutable
 * Laws. Per CLAUDE.md we NEVER hide the button — the user must be able to
 * see it and understand why they can't use it.
 */
export function UserActionButton({
  actor,
  target,
  action,
  ctx,
  variant = 'secondary',
  className,
  children,
  ...rest
}: UserActionButtonProps) {
  const { allowed, reason } = checkAdminRules(actor, target, action, ctx);

  const button = (
    <button
      type="button"
      disabled={!allowed}
      aria-disabled={!allowed}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-button px-3 py-1.5 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        VARIANT[variant],
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-inherit',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );

  if (allowed) return button;
  return <Tooltip content={reason}>{button}</Tooltip>;
}
