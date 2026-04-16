import { cn } from '@lms/ui';

import type { Role } from '@/lib/rbac';

/**
 * Role badge with the colour assignment from CLAUDE.md:
 *   SuperAdmin = vàng gold (#F59E0B)
 *   Admin      = xanh blue (#3B82F6)
 *   Instructor = xanh lá  (#10B981)
 *   Student    = xám      (#6B7280)
 */
const ROLE_MAP: Record<Role, { label: string; bg: string; text: string; dot: string }> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  ADMIN: {
    label: 'Admin',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  INSTRUCTOR: {
    label: 'Instructor',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  STUDENT: {
    label: 'Student',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
  },
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const conf = ROLE_MAP[role];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        conf.bg,
        conf.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', conf.dot)} aria-hidden />
      {conf.label}
    </span>
  );
}
