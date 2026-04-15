'use client';

import { cn } from '@lms/ui';
import * as React from 'react';

/**
 * Minimal CSS-only tooltip. Wraps its children in a group and renders a
 * floating div that becomes visible on hover / focus. No external dep —
 * good enough for the RBAC disabled-button explanation case, which is the
 * only place we need tooltips for Phase 04.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  if (!content) return <>{children}</>;
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          'whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg',
          'opacity-0 transition-opacity duration-150',
          'group-hover:opacity-100 group-focus-within:opacity-100',
          'dark:bg-slate-100 dark:text-slate-900',
        )}
      >
        {content}
      </span>
    </span>
  );
}
