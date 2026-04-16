'use client';

import { Card, CardContent, cn } from '@lms/ui';
import { ArrowDownRight, ArrowUpRight, type LucideIcon, Minus } from 'lucide-react';

/**
 * KPI card for the admin dashboard (Phase 09).
 *
 * Renders a big number + delta% arrow vs last month. Supports `loading`
 * state (skeleton shimmer) and color-coded icon circle.
 */
type KpiColor = 'primary' | 'secondary' | 'success' | 'warning';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  deltaPct?: number;
  color?: KpiColor;
  loading?: boolean;
}

const COLOR_CLASSES: Record<KpiColor, { icon: string; bg: string }> = {
  primary: { icon: 'text-primary', bg: 'bg-primary/10' },
  secondary: { icon: 'text-secondary', bg: 'bg-secondary/10' },
  success: { icon: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
  warning: { icon: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  deltaPct,
  color = 'primary',
  loading,
}: KpiCardProps) {
  const colorClasses = COLOR_CLASSES[color];
  const DeltaIcon =
    deltaPct === undefined
      ? Minus
      : deltaPct > 0
        ? ArrowUpRight
        : deltaPct < 0
          ? ArrowDownRight
          : Minus;

  const deltaColor =
    deltaPct === undefined || deltaPct === 0
      ? 'text-muted'
      : deltaPct > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-surface-2" />
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
              {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
            </p>
          )}
          {deltaPct !== undefined && !loading && (
            <div className={cn('mt-2 flex items-center gap-1 text-xs font-semibold', deltaColor)}>
              <DeltaIcon className="h-3.5 w-3.5" />
              <span>
                {deltaPct > 0 && '+'}
                {deltaPct}%
              </span>
              <span className="font-normal text-muted">so với tháng trước</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
            colorClasses.bg,
          )}
        >
          <Icon className={cn('h-6 w-6', colorClasses.icon)} />
        </div>
      </CardContent>
    </Card>
  );
}
