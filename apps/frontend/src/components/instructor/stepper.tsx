'use client';

import { cn } from '@lms/ui';
import { Check } from 'lucide-react';

interface StepperProps {
  steps: string[];
  current: number; // 0-indexed
  className?: string;
}

/**
 * Wizard stepper (Phase 10). Top progress bar + numbered/checked dots.
 *
 * The component is purely presentational — the parent owns `current`
 * and validates each step before incrementing.
 */
export function Stepper({ steps, current, className }: StepperProps) {
  // Progress fill: 0% on step 1, 100% when last step is current.
  const progressPct = steps.length <= 1 ? 100 : Math.round((current / (steps.length - 1)) * 100);

  return (
    <div className={cn('w-full', className)}>
      {/* Top progress line */}
      <div className="relative mb-4 h-1 w-full rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step dots */}
      <ol className="flex items-start justify-between">
        {steps.map((label, idx) => {
          const isDone = idx < current;
          const isCurrent = idx === current;
          return (
            <li key={label} className="flex flex-1 flex-col items-center text-center">
              <span
                className={cn(
                  'mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  'border-2 text-sm font-bold transition-colors',
                  isDone
                    ? 'border-primary bg-primary text-white'
                    : isCurrent
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface text-muted',
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : idx + 1}
              </span>
              <span
                className={cn(
                  'text-xs font-medium',
                  isCurrent ? 'text-foreground' : isDone ? 'text-foreground' : 'text-muted',
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
