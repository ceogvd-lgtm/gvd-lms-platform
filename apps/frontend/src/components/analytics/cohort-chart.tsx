'use client';

import { Card, CardContent } from '@lms/ui';
import { TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { CohortPoint } from '@/lib/analytics';

interface CohortChartProps {
  points: CohortPoint[];
  /** Alternate rendering style — area instead of line. */
  variant?: 'line' | 'area';
}

const COHORT_COLORS = ['#1E40AF', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];

/**
 * Phase 15 — cohort retention chart.
 *
 * Reshapes the flat `CohortPoint[]` into a wide table keyed by `week`
 * with one column per cohort month. Recharts LineChart handles
 * mismatched data points gracefully (missing weeks become gaps in
 * that cohort's line).
 */
export function CohortChart({ points }: CohortChartProps) {
  if (points.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <TrendingUp className="h-8 w-8 text-muted" />
          <p className="text-sm font-semibold text-foreground">Chưa có cohort nào</p>
          <p className="text-xs text-muted">Cần ít nhất 1 enrollment để hiển thị cohort.</p>
        </CardContent>
      </Card>
    );
  }

  // Discover cohorts + max week
  const cohorts = [...new Set(points.map((p) => p.cohortMonth))].sort();
  const maxWeek = Math.max(...points.map((p) => p.week));

  // Build wide-format data: [{ week: 0, '2026-03': 40, '2026-04': 20 }, ...]
  const wide: Array<Record<string, number | string>> = [];
  for (let w = 0; w <= maxWeek; w++) {
    const row: Record<string, number | string> = { week: `Tuần ${w}` };
    for (const cohort of cohorts) {
      const match = points.find((p) => p.cohortMonth === cohort && p.week === w);
      if (match) row[cohort] = match.avgProgress;
    }
    wide.push(row);
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={wide}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="week" stroke="currentColor" className="text-xs" />
          <YAxis stroke="currentColor" className="text-xs" domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--surface))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 8,
            }}
          />
          <Legend />
          {cohorts.map((cohort, i) => (
            <Line
              key={cohort}
              type="monotone"
              dataKey={cohort}
              stroke={COHORT_COLORS[i % COHORT_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
