'use client';

import type { HeatmapCell } from '@/lib/analytics';

interface ActivityHeatmapProps {
  cells: HeatmapCell[];
}

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * Phase 15 — GitHub-style activity heatmap.
 *
 * Grid 7 rows (day of week) × 24 columns (hour of day). Intensity is
 * derived from the cell count's quantile within the whole dataset so the
 * colors auto-scale — a quiet instructor and a busy system both produce
 * readable contrast instead of "everything looks pale".
 *
 * Hover tooltip: "Thứ X, HH:00 — N học viên".
 */
export function ActivityHeatmap({ cells }: ActivityHeatmapProps) {
  const max = Math.max(1, ...cells.map((c) => c.count));

  // Arrange as [day][hour] matrix for render
  const matrix: HeatmapCell[][] = Array.from({ length: 7 }, () => Array(24).fill(null));
  for (const c of cells) {
    matrix[c.day]![c.hour] = c;
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Hour header row */}
        <div className="flex items-center gap-0.5 pl-8">
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="w-4 text-center text-[9px] text-muted"
              title={`${String(h).padStart(2, '0')}:00`}
            >
              {h % 3 === 0 ? h : ''}
            </div>
          ))}
        </div>
        {/* 7 day rows */}
        {matrix.map((row, day) => (
          <div key={day} className="mt-0.5 flex items-center gap-0.5">
            <span className="w-8 text-right pr-2 text-[10px] font-semibold text-muted">
              {DAY_LABELS[day]}
            </span>
            {row.map((c, hour) => {
              const count = c?.count ?? 0;
              const intensity = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
              const bg =
                intensity === 0
                  ? 'bg-surface-2'
                  : intensity === 1
                    ? 'bg-primary/25'
                    : intensity === 2
                      ? 'bg-primary/50'
                      : intensity === 3
                        ? 'bg-primary/75'
                        : 'bg-primary';
              return (
                <div
                  key={hour}
                  className={`h-4 w-4 rounded-sm ${bg}`}
                  title={`${DAY_LABELS[day]}, ${String(hour).padStart(2, '0')}:00 — ${count} hoạt động`}
                />
              );
            })}
          </div>
        ))}
        {/* Legend */}
        <div className="mt-3 flex items-center gap-1 pl-10 text-[10px] text-muted">
          <span>Ít</span>
          <span className="h-3 w-3 rounded-sm bg-surface-2" />
          <span className="h-3 w-3 rounded-sm bg-primary/25" />
          <span className="h-3 w-3 rounded-sm bg-primary/50" />
          <span className="h-3 w-3 rounded-sm bg-primary/75" />
          <span className="h-3 w-3 rounded-sm bg-primary" />
          <span>Nhiều</span>
        </div>
      </div>
    </div>
  );
}
