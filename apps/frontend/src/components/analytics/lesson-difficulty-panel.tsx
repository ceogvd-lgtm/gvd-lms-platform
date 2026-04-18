'use client';

import { Badge, Button, Card, CardContent } from '@lms/ui';
import { Edit3, TrendingDown } from 'lucide-react';
import Link from 'next/link';

import type { LessonDifficultyRow } from '@/lib/analytics';

interface LessonDifficultyPanelProps {
  rows: LessonDifficultyRow[];
  /** Only show top N hardest. Default 10. */
  limit?: number;
  /** When true, shows "Cải thiện nội dung" button linking to lesson edit page. */
  showEditButton?: boolean;
}

/**
 * Phase 15 — horizontal bar chart for lesson difficulty.
 *
 * Manual SVG bars (not Recharts) because:
 *   - the rows are sorted client-side and already capped at N
 *   - we need per-row action buttons aligned with each bar
 *   - Recharts BarChart makes per-row click zones awkward
 *
 * Color thresholds (from spec):
 *   avg < 50%  → red
 *   50–70%     → yellow
 *   > 70%      → green
 */
export function LessonDifficultyPanel({
  rows,
  limit = 10,
  showEditButton = true,
}: LessonDifficultyPanelProps) {
  const top = rows.slice(0, limit);

  if (top.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <TrendingDown className="h-8 w-8 text-muted" />
          <p className="text-sm font-semibold text-foreground">Chưa có dữ liệu độ khó</p>
          <p className="text-xs text-muted">
            Cần ít nhất 1 bài học đã có điểm kiểm tra để tính toán.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {top.map((r) => {
          const tone: 'error' | 'warning' | 'success' =
            r.avgScore < 50 ? 'error' : r.avgScore < 70 ? 'warning' : 'success';
          const barColor =
            r.avgScore < 50 ? 'bg-error' : r.avgScore < 70 ? 'bg-warning' : 'bg-success';
          return (
            <div key={r.lessonId} className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{r.lessonTitle}</p>
                  <p className="truncate text-xs text-muted">{r.courseTitle}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={tone}>{r.avgScore}%</Badge>
                  {showEditButton && (
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Link href={`/instructor/lessons/${r.lessonId}/edit`}>
                        <Edit3 className="h-3 w-3" />
                        <span className="hidden sm:inline">Cải thiện</span>
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
              <div className="relative h-4 overflow-hidden rounded bg-surface-2">
                <div
                  className={`h-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.max(2, r.avgScore)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted">
                <span>
                  {r.attemptCount} lượt làm · fail {r.failRate}%
                </span>
                <span>TB {Math.round(r.avgTimeSpent / 60)} phút</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
