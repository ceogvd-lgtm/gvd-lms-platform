'use client';

import { cn } from '@lms/ui';

/**
 * Shared Recharts tooltip — matches the app's rounded-card + border design.
 *
 * Recharts injects this with a known shape; we type the interesting fields
 * only and ignore the rest.
 */
interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  /** Format value before display (e.g. percent, currency). */
  formatValue?: (value: number | string) => string;
  className?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  className,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface shadow-lg',
        'min-w-[140px] p-3 text-sm',
        className,
      )}
    >
      {label && <div className="mb-2 font-semibold text-foreground">{label}</div>}
      <ul className="space-y-1">
        {payload.map((entry, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? '#1E40AF' }}
              />
              {entry.name}
            </span>
            <span className="font-semibold text-foreground">
              {formatValue && entry.value !== undefined
                ? formatValue(entry.value)
                : String(entry.value ?? '')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
