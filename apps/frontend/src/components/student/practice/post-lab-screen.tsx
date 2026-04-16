'use client';

import { Button, cn } from '@lms/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldAlert,
  Trophy,
  XCircle,
} from 'lucide-react';

import type { CompleteAttemptResult, SafetyItemConfig } from '@/lib/practice';

interface PostLabScreenProps {
  result: CompleteAttemptResult;
  /** Total elapsed time in seconds. */
  durationSeconds: number;
  /** Safety checklist from the scoring config — used to hydrate violation
   *  descriptions (criticalViolations stores ids only). */
  safetyChecklist: SafetyItemConfig[];
  /** Average score across the whole class — omitted until Phase 13 ranks
   *  it, but the card is wired to show it when provided. */
  classAverage?: number;
  /** True when the student still has attempts left. */
  canRetry: boolean;
  onRetry: () => void;
  onBackToTheory: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} phút ${s.toString().padStart(2, '0')} giây`;
}

/**
 * Post-attempt summary the student sees immediately after the lab ends.
 *
 *   - Giant score badge (emerald when passed, rose when failed)
 *   - Per-step timeline — green ✓, red ✗, grey "bỏ"
 *   - Critical safety violations (red card, one per violation)
 *   - Time spent
 *   - Compare-to-class bar (hidden when no data)
 *   - Retry / back-to-theory buttons
 */
export function PostLabScreen({
  result,
  durationSeconds,
  safetyChecklist,
  classAverage,
  canRetry,
  onRetry,
  onBackToTheory,
}: PostLabScreenProps) {
  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
  const safetyById = new Map(safetyChecklist.map((s) => [s.safetyId, s]));

  return (
    <div className="space-y-4">
      {/* Big score badge */}
      <div
        className={cn(
          'rounded-card border p-8 text-center',
          result.passed
            ? 'border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-transparent'
            : 'border-rose-500/50 bg-gradient-to-br from-rose-500/10 to-transparent',
        )}
      >
        <Trophy
          className={cn(
            'mx-auto mb-2 h-12 w-12',
            result.passed ? 'text-emerald-500' : 'text-rose-500',
          )}
        />
        <p className="text-xs uppercase tracking-wide text-muted">Kết quả</p>
        <p
          className={cn(
            'mt-1 text-5xl font-black tabular-nums',
            result.passed ? 'text-emerald-600' : 'text-rose-500',
          )}
        >
          {pct}%
        </p>
        <p className="mt-2 text-sm font-semibold">
          {result.score} / {result.maxScore} điểm ·{' '}
          {result.passed ? 'Đã qua bài thực hành' : 'Chưa đạt'}
        </p>
        <p className="mt-2 text-xs text-muted">{result.feedback}</p>
      </div>

      {/* Per-step breakdown */}
      {result.stepBreakdown.length > 0 && (
        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Chi tiết từng bước</h3>
          <ul className="space-y-2 text-sm">
            {result.stepBreakdown.map((step, idx) => (
              <li
                key={step.stepId}
                className={cn(
                  'flex items-center gap-3 rounded-button border px-3 py-2',
                  step.skipped
                    ? 'border-border bg-surface-2/40 text-muted'
                    : step.isCorrect
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-rose-500/40 bg-rose-500/5',
                )}
              >
                <span className="w-6 text-center text-xs font-semibold text-muted">{idx + 1}</span>
                {step.skipped ? (
                  <span className="h-4 w-4 rounded-full border-2 border-muted" />
                ) : step.isCorrect ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-500" />
                )}
                <span className="flex-1 truncate">
                  {step.stepId}
                  {step.isInOrder && !step.skipped && step.isCorrect && (
                    <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-600">
                      +10% thứ tự
                    </span>
                  )}
                </span>
                <span className="text-xs tabular-nums">
                  {step.awarded} / {step.maxPoints}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Critical safety violations */}
      {result.criticalViolations.length > 0 && (
        <div className="rounded-card border border-rose-500/40 bg-rose-500/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-4 w-4" />
            Vi phạm ATVSLĐ ({result.criticalViolations.length})
          </h3>
          <p className="mb-2 text-xs text-muted">
            Mỗi vi phạm trừ 20% điểm tổng. Tổng trừ:{' '}
            <strong className="text-rose-600">-{result.penalty}</strong> điểm.
          </p>
          <ul className="space-y-1.5 text-sm">
            {result.criticalViolations.map((id, idx) => {
              const item = safetyById.get(id);
              return (
                <li
                  key={`${id}-${idx}`}
                  className="flex items-start gap-2 text-rose-700 dark:text-rose-300"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>{item?.description ?? id}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Footer: duration + class-avg + actions */}
      <div className="rounded-card border border-border bg-surface p-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              <Clock className="mr-1 inline h-3 w-3" />
              Thời gian
            </p>
            <p className="mt-1 font-semibold">{formatDuration(durationSeconds)}</p>
          </div>
          {typeof classAverage === 'number' && (
            <div className="col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted">So với lớp</p>
              <div className="mt-1 flex items-center gap-3">
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                    style={{ width: `${Math.min(100, classAverage)}%` }}
                  />
                  <div
                    className="absolute inset-y-[-2px] w-0.5 bg-emerald-500"
                    style={{ left: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold">
                  TB {classAverage}% · bạn {pct}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onBackToTheory}>
          Xem lại bài lý thuyết
        </Button>
        {canRetry && (
          <Button onClick={onRetry}>
            <RotateCcw className="h-4 w-4" />
            Làm lại
          </Button>
        )}
      </div>
    </div>
  );
}
