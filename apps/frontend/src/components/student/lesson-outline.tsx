'use client';

import { cn } from '@lms/ui';
import { CheckCircle2, Circle, Lock } from 'lucide-react';
import Link from 'next/link';

import type { Chapter, Lesson } from '@/lib/curriculum';

export type LessonWithStatus = Lesson & {
  status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  locked?: boolean;
};

interface LessonOutlineProps {
  chapters: Array<Chapter & { lessons?: LessonWithStatus[] }>;
  currentLessonId: string;
}

/**
 * Course outline shown in the student-side sidebar.
 *
 * One row per lesson, grouped by chapter. A lesson can be:
 *   - COMPLETED → emerald check icon
 *   - IN_PROGRESS → primary circle icon
 *   - NOT_STARTED (default) → muted circle
 *   - locked → lock icon + opacity-50, click is disabled via tooltip
 *
 * Locking rule (client-side heuristic): a lesson is locked if the
 * preceding lesson in the same chapter is not yet COMPLETED. Real
 * enforcement is already on the backend (API denies rendering if the
 * student isn't enrolled / doesn't have prerequisites), so the UI hint
 * is sufficient here.
 */
export function LessonOutline({ chapters, currentLessonId }: LessonOutlineProps) {
  return (
    <nav className="h-full overflow-y-auto border-r border-border bg-surface-2/40 p-3">
      <div className="space-y-4">
        {chapters.map((ch) => (
          <div key={ch.id}>
            <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {ch.title}
            </p>
            <ul className="space-y-0.5">
              {((ch.lessons ?? []) as LessonWithStatus[]).map((l) => {
                const isCurrent = l.id === currentLessonId;
                const Icon = l.status === 'COMPLETED' ? CheckCircle2 : l.locked ? Lock : Circle;
                const tone =
                  l.status === 'COMPLETED'
                    ? 'text-emerald-500'
                    : l.status === 'IN_PROGRESS'
                      ? 'text-primary'
                      : 'text-muted';
                return (
                  <li key={l.id}>
                    <Link
                      href={`/student/lessons/${l.id}`}
                      className={cn(
                        'flex items-center gap-2 rounded-button px-2 py-1.5 text-sm transition-colors',
                        isCurrent
                          ? 'bg-primary/10 font-semibold text-primary'
                          : l.locked
                            ? 'pointer-events-none opacity-50'
                            : 'text-foreground hover:bg-surface-2',
                      )}
                      title={l.locked ? 'Chưa mở khoá' : undefined}
                    >
                      <Icon className={cn('h-4 w-4', tone)} />
                      <span className="truncate flex-1">{l.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
