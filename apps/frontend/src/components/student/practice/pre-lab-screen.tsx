'use client';

import { Button, cn } from '@lms/ui';
import { Clock, PlayCircle, RotateCcw, ShieldAlert, Target, Trophy } from 'lucide-react';

import type { AttemptRow, ScoringConfig } from '@/lib/practice';

interface PreLabScreenProps {
  title: string;
  introduction: string;
  objectives: string[];
  scoringConfig: ScoringConfig;
  maxAttempts: number | null;
  attemptHistory: AttemptRow[];
  /** True while the server call to `/practice/start` is in-flight. */
  starting: boolean;
  onStart: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}p${s.toString().padStart(2, '0')}`;
}

/**
 * Landing card the student sees BEFORE Unity boots.
 *
 * Emphasises safety rules (red, icon-led) because most real-world
 * practice lessons on the platform are industrial / welding / electrical
 * where operators genuinely need the reminder. Attempt history is shown
 * so a repeat student can see their previous scores and whether they've
 * passed before.
 */
export function PreLabScreen({
  title,
  introduction,
  objectives,
  scoringConfig,
  maxAttempts,
  attemptHistory,
  starting,
  onStart,
}: PreLabScreenProps) {
  const attemptsUsed = attemptHistory.length;
  const attemptsLeft = maxAttempts == null ? null : Math.max(0, maxAttempts - attemptsUsed);
  const exhausted = attemptsLeft === 0;
  const passed = attemptHistory.some(
    (a) =>
      a.status === 'COMPLETED' &&
      a.maxScore > 0 &&
      (a.score / a.maxScore) * 100 >= scoringConfig.passScore,
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-xl font-bold">{title || 'Bài thực hành ảo'}</h2>
        {introduction && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted">{introduction}</p>
        )}
      </div>

      {/* Objectives */}
      {objectives.length > 0 && (
        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold">Mục tiêu</h3>
          <ul className="space-y-1.5 text-sm">
            {objectives.map((o, i) => (
              <li key={i} className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Safety — red emphasis per spec */}
      {scoringConfig.safetyChecklist.length > 0 && (
        <div className="rounded-card border border-rose-500/40 bg-rose-500/5 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-5 w-5" />
            Quy tắc an toàn bắt buộc
          </h3>
          <ul className="space-y-2 text-sm">
            {scoringConfig.safetyChecklist.map((s) => (
              <li
                key={s.safetyId}
                className="flex items-start gap-2 text-rose-700 dark:text-rose-300"
              >
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    s.isCritical ? 'bg-rose-500 text-white' : 'bg-rose-500/20 text-rose-600',
                  )}
                >
                  !
                </span>
                <span>
                  {s.description ?? s.safetyId}
                  {s.isCritical && (
                    <span className="ml-2 inline-flex rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300">
                      Critical
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard
          icon={<Trophy className="h-4 w-4" />}
          label="Điểm pass"
          value={`${scoringConfig.passScore}%`}
        />
        {scoringConfig.timeLimit && (
          <InfoCard
            icon={<Clock className="h-4 w-4" />}
            label="Thời gian"
            value={`${Math.round(scoringConfig.timeLimit / 60)} phút`}
          />
        )}
        <InfoCard
          icon={<RotateCcw className="h-4 w-4" />}
          label="Số lần"
          value={maxAttempts == null ? 'Không giới hạn' : `${attemptsLeft}/${maxAttempts}`}
        />
        {passed && (
          <InfoCard
            icon={<Trophy className="h-4 w-4 text-emerald-500" />}
            label="Trạng thái"
            value="Đã qua"
            tone="emerald"
          />
        )}
      </div>

      {/* Attempt history */}
      {attemptHistory.length > 0 && (
        <div className="rounded-card border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold">Lịch sử phiên đã làm</h3>
          <ul className="divide-y divide-border text-sm">
            {attemptHistory.slice(0, 5).map((a) => {
              const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
              const didPass = pct >= scoringConfig.passScore;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <span className="w-20 shrink-0 text-xs text-muted">
                    {new Date(a.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                  <span className="flex-1">
                    <span className="font-semibold">{pct}%</span>
                    <span className="ml-2 text-xs text-muted">
                      ({a.score}/{a.maxScore}) · {formatDuration(a.duration)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                      a.status !== 'COMPLETED'
                        ? 'bg-surface-2 text-muted'
                        : didPass
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                    )}
                  >
                    {a.status === 'COMPLETED' ? (didPass ? 'Passed' : 'Failed') : 'In Progress'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* CTA */}
      <div className="flex justify-end">
        <Button
          onClick={onStart}
          disabled={starting || exhausted}
          size="lg"
          className="min-w-[200px]"
        >
          <PlayCircle className="h-5 w-5" />
          {starting
            ? 'Đang khởi tạo…'
            : exhausted
              ? 'Đã hết lượt'
              : attemptsUsed > 0
                ? 'Làm lại bài thực hành'
                : 'Bắt đầu thực hành'}
        </Button>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'emerald';
}) {
  return (
    <div
      className={cn(
        'rounded-card border bg-surface p-3 text-sm',
        tone === 'emerald' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border',
      )}
    >
      <div className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-muted">
        {icon}
        {label}
      </div>
      <p className="font-bold">{value}</p>
    </div>
  );
}
