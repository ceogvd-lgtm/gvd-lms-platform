'use client';

import { Avatar, cn } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldAlert, Trophy } from 'lucide-react';
import { useState } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { practiceApi, type AttemptRow, type PracticeAnalytics } from '@/lib/practice';

interface PracticeAnalyticsViewProps {
  /** Lessons the instructor can inspect. Filter to ones with practice
   *  content before calling — we don't fetch per-lesson to know. */
  lessons: Array<{ id: string; title: string; courseTitle?: string }>;
}

/**
 * Practice-lesson analytics pane. Instructor picks a lesson from the
 * dropdown → we fetch `/practice/:lessonId/analytics` and render four
 * sections:
 *   1. KPI strip — total attempts, avg score, pass %, avg duration
 *   2. Step heat-map — gradient red→green based on correct %
 *   3. Safety violation stats — critical rows highlighted
 *   4. Ranking table — top 50 students by best score
 *
 * If no practice lesson is selected we show an empty-state card prompt
 * instead of running a query on `''`.
 */
export function PracticeAnalyticsView({ lessons }: PracticeAnalyticsViewProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [lessonId, setLessonId] = useState<string>(lessons[0]?.id ?? '');
  const [inspectStudent, setInspectStudent] = useState<string | null>(null);

  const analytics = useQuery<PracticeAnalytics>({
    queryKey: ['practice-analytics', lessonId],
    queryFn: () => practiceApi.getAnalytics(lessonId, accessToken!),
    enabled: !!accessToken && !!lessonId,
  });

  const attempts = useQuery<AttemptRow[]>({
    queryKey: ['practice-attempts-all', lessonId],
    queryFn: () => practiceApi.listAttempts(lessonId, accessToken!),
    enabled: !!accessToken && !!lessonId && !!inspectStudent,
  });

  if (lessons.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center text-sm text-muted">
        Chưa có bài giảng nào có phần Thực hành ảo. Giảng viên cần thêm nội dung thực hành trước khi
        có dữ liệu phân tích.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lesson picker */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="practice-lesson" className="text-sm font-semibold">
          Bài giảng:
        </label>
        <select
          id="practice-lesson"
          value={lessonId}
          onChange={(e) => {
            setLessonId(e.target.value);
            setInspectStudent(null);
          }}
          className="h-9 min-w-[280px] rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        >
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.courseTitle ? `${l.courseTitle} — ${l.title}` : l.title}
            </option>
          ))}
        </select>
      </div>

      {!lessonId ? (
        <p className="text-sm text-muted">Chọn bài giảng để xem phân tích.</p>
      ) : analytics.isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-card bg-surface-2" />
          ))}
        </div>
      ) : !analytics.data ? (
        <div className="rounded-card border border-dashed border-border py-10 text-center text-sm text-muted">
          Chưa có dữ liệu.
        </div>
      ) : (
        <>
          <KpiStrip data={analytics.data} />
          <StepHeatMap data={analytics.data} />
          <SafetyViolationTable data={analytics.data} />
          <RankingTable data={analytics.data} onInspect={(sid) => setInspectStudent(sid)} />
          {inspectStudent && (
            <StudentTimeline
              studentId={inspectStudent}
              rows={attempts.data ?? []}
              onClose={() => setInspectStudent(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function KpiStrip({ data }: { data: PracticeAnalytics }) {
  const cards = [
    { label: 'Tổng phiên', value: data.totalAttempts, suffix: '' },
    { label: 'Điểm TB', value: data.avgScore, suffix: '' },
    { label: '% Pass', value: data.passRate, suffix: '%' },
    {
      label: 'Thời gian TB',
      value: Math.round(data.avgDuration / 60),
      suffix: 'p',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-card border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{c.label}</p>
          <p className="mt-1 text-2xl font-black tabular-nums">
            {c.value}
            <span className="ml-0.5 text-base font-medium text-muted">{c.suffix}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

function StepHeatMap({ data }: { data: PracticeAnalytics }) {
  if (data.stepAnalytics.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border py-8 text-center text-sm text-muted">
        Bài này chưa có step nào trong scoring config.
      </div>
    );
  }
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold">Heat map — mức độ thành công theo bước</h3>
      <p className="mb-3 text-xs text-muted">
        Màu xanh = nhiều học viên làm đúng, đỏ = nhiều học viên sai. Hover vào ô để xem chi tiết.
      </p>
      <ul className="space-y-2">
        {data.stepAnalytics.map((s) => (
          <li key={s.stepId} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate font-mono text-xs text-muted" title={s.stepId}>
              {s.stepId}
            </span>
            <span className="flex-1 truncate text-sm">{s.description}</span>
            <div className="h-4 w-48 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.max(3, s.correctPercent)}%`,
                  background: `hsl(${Math.round((s.correctPercent / 100) * 120)}, 70%, 45%)`,
                }}
                title={`${s.correct}/${s.attempts} đúng`}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">
              {s.correctPercent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SafetyViolationTable({ data }: { data: PracticeAnalytics }) {
  if (data.safetyViolationStats.length === 0) return null;
  const sorted = [...data.safetyViolationStats].sort((a, b) => b.violationCount - a.violationCount);
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="h-4 w-4 text-rose-500" />
        Vi phạm ATVSLĐ thường gặp
      </h3>
      <ul className="space-y-1.5 text-sm">
        {sorted.map((v) => (
          <li
            key={v.safetyId}
            className={cn(
              'flex items-center gap-3 rounded-button border px-3 py-2',
              v.isCritical ? 'border-rose-500/40 bg-rose-500/5' : 'border-border bg-surface-2/30',
            )}
          >
            {v.isCritical && <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-500" />}
            <span className="flex-1 truncate">{v.description}</span>
            <span className="tabular-nums text-xs text-muted">{v.violationCount} lần</span>
            <span className="w-14 text-right text-xs font-semibold tabular-nums">
              {v.violationPercent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankingTable({
  data,
  onInspect,
}: {
  data: PracticeAnalytics;
  onInspect: (studentId: string) => void;
}) {
  if (data.ranking.length === 0) {
    return null;
  }
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Trophy className="h-4 w-4 text-amber-500" />
        Bảng xếp hạng (top {Math.min(data.ranking.length, 50)})
      </h3>
      <div className="overflow-hidden rounded-button border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Học viên</th>
              <th className="px-3 py-2">Điểm</th>
              <th className="px-3 py-2">Lần thử</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.ranking.map((r, idx) => {
              const pct = r.bestMaxScore > 0 ? Math.round((r.bestScore / r.bestMaxScore) * 100) : 0;
              return (
                <tr key={r.studentId} className="hover:bg-surface-2/40">
                  <td className="px-3 py-2 text-xs font-semibold text-muted">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar
                        size="sm"
                        initials={(r.studentName || 'HV').slice(0, 2).toUpperCase()}
                        alt={r.studentName}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.studentName}</p>
                        <p className="truncate text-xs text-muted">{r.studentEmail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <span className="font-semibold">{r.bestScore}</span>
                    <span className="text-xs text-muted"> / {r.bestMaxScore}</span>
                    <span className="ml-1 text-xs font-semibold text-primary">{pct}%</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.attemptCount}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                        r.passed
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {r.passed ? 'Đã qua' : 'Chưa đạt'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onInspect(r.studentId)}
                      className="rounded-button border border-border px-2 py-0.5 text-xs font-semibold text-muted hover:border-primary hover:text-primary"
                    >
                      Timeline
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StudentTimeline({
  studentId,
  rows,
  onClose,
}: {
  studentId: string;
  rows: AttemptRow[];
  onClose: () => void;
}) {
  const studentRows = rows.filter((r) => r.studentId === studentId);
  if (studentRows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
        Học viên này chưa có phiên nào.{' '}
        <button type="button" onClick={onClose} className="text-primary underline">
          Đóng
        </button>
      </div>
    );
  }
  return (
    <div className="rounded-card border border-primary/40 bg-primary/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Timeline thao tác — {studentRows[0]!.student?.name ?? studentId}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-button border border-border bg-surface px-2 py-1 text-xs"
        >
          Đóng
        </button>
      </div>
      <ul className="space-y-4">
        {studentRows.map((attempt) => {
          const actions = Array.isArray(attempt.actions)
            ? (attempt.actions as Array<{
                stepId: string;
                isCorrect: boolean;
                timestamp?: number;
              }>)
            : [];
          return (
            <li key={attempt.id} className="rounded-card border border-border bg-surface p-3">
              <p className="mb-2 text-xs font-semibold text-muted">
                {new Date(attempt.createdAt).toLocaleString('vi-VN')} — {attempt.score}/
                {attempt.maxScore} · {Math.round(attempt.duration / 60)} phút
              </p>
              {actions.length === 0 ? (
                <p className="text-xs text-muted">Không có thao tác nào được ghi.</p>
              ) : (
                <ol className="space-y-1 text-xs">
                  {actions.slice(0, 20).map((a, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-6 text-right text-muted">{i + 1}.</span>
                      <span
                        className={cn(
                          'inline-block h-2 w-2 rounded-full',
                          a.isCorrect ? 'bg-emerald-500' : 'bg-rose-500',
                        )}
                      />
                      <span className="font-mono">{a.stepId}</span>
                      {a.timestamp && (
                        <span className="ml-auto text-muted">
                          {new Date(a.timestamp).toLocaleTimeString('vi-VN')}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
