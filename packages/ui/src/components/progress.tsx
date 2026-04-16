import * as React from 'react';

import { cn } from '../lib/cn';

/* ============================================================
 * Linear progress bar
 * ============================================================ */

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..100 */
  value: number;
  /** Optional ARIA label override. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_HEIGHT: Record<NonNullable<ProgressProps['size']>, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ value, label, size = 'md', className, ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Progress ${clamped}%`}
        className={cn(
          'w-full overflow-hidden rounded-full bg-surface-2',
          SIZE_HEIGHT[size],
          className,
        )}
        {...props}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out-quad"
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = 'Progress';

/* ============================================================
 * Circular progress (SVG stroke-dasharray)
 * ============================================================ */

export interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Show numeric percentage in the centre. */
  showLabel?: boolean;
}

export function CircularProgress({
  value,
  size = 64,
  strokeWidth = 6,
  className,
  showLabel = true,
}: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--surface-2))"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-500 ease-out-quad"
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-semibold text-foreground tabular-nums">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
