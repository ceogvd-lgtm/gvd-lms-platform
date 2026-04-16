'use client';

import { cn } from '@lms/ui';

import type { Difficulty } from '@/lib/assessments';

const LABEL: Record<Difficulty, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
};

const STYLES: Record<Difficulty, string> = {
  // green = success
  EASY: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/30',
  // yellow = warning
  MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/30',
  // red = error
  HARD: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-inset ring-rose-500/30',
};

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: Difficulty;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        STYLES[difficulty],
        className,
      )}
    >
      {LABEL[difficulty]}
    </span>
  );
}
