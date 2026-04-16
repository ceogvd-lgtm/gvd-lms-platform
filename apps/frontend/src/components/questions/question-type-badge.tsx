'use client';

import { cn } from '@lms/ui';
import { CheckSquare, Circle, PenLine, ToggleLeft } from 'lucide-react';

import type { QuestionType } from '@/lib/assessments';

const META: Record<QuestionType, { label: string; icon: typeof Circle; className: string }> = {
  SINGLE_CHOICE: {
    label: '1 đáp án',
    icon: Circle,
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-1 ring-inset ring-blue-500/30',
  },
  MULTI_CHOICE: {
    label: 'Nhiều đáp án',
    icon: CheckSquare,
    className:
      'bg-violet-500/10 text-violet-600 dark:text-violet-300 ring-1 ring-inset ring-violet-500/30',
  },
  TRUE_FALSE: {
    label: 'Đúng / Sai',
    icon: ToggleLeft,
    className: 'bg-sky-500/10 text-sky-600 dark:text-sky-300 ring-1 ring-inset ring-sky-500/30',
  },
  FILL_BLANK: {
    label: 'Điền vào chỗ trống',
    icon: PenLine,
    className:
      'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/30',
  },
};

export function QuestionTypeBadge({ type, className }: { type: QuestionType; className?: string }) {
  const m = META[type];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        m.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}
