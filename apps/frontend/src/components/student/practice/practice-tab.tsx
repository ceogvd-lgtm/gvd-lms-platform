'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { PostLabScreen } from './post-lab-screen';
import { PreLabScreen } from './pre-lab-screen';
import { WebGLRunner } from './webgl-runner';

import { ApiError, practiceContentsApi as phase10Api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  practiceApi,
  type CompleteAttemptResult,
  type ScoringConfig,
  type ScoringStepConfig,
  type SafetyItemConfig,
  type StartAttemptResult,
} from '@/lib/practice';


interface PracticeTabProps {
  lessonId: string;
  /** Student id + name — passed through to Unity via the LMS Bridge. */
  studentId: string;
  studentName: string;
  /** Called after a successful pass so the outer page can refetch lesson
   *  progress + show the confetti. */
  onPassed?: () => void;
  /** Go back to the theory tab (post-lab "Xem lại bài lý thuyết" button). */
  onBackToTheory?: () => void;
}

type Phase = 'pre-lab' | 'running' | 'post-lab';

interface RunningSession {
  attempt: StartAttemptResult;
  webglUrl: string;
  startedAt: number;
}

interface Completed {
  result: CompleteAttemptResult;
  durationSeconds: number;
  scoringConfig: ScoringConfig;
  attemptsRemaining: number | null;
}

/**
 * Top-level wrapper for the Thực hành ảo tab on /student/lessons/:id.
 *
 * Drives a 3-phase state machine:
 *   pre-lab  → /practice/start → attempt + scoring config
 *   running  → WebGLRunner mounts iframe, piping postMessage → /action
 *              and finally → /complete
 *   post-lab → shows PostLabScreen; retry returns to pre-lab.
 */
export function PracticeTab({
  lessonId,
  studentId,
  studentName,
  onPassed,
  onBackToTheory,
}: PracticeTabProps) {
  const accessToken = useAuthStore((s) => s.accessToken);

  const pcQuery = useQuery({
    queryKey: ['student-practice-content', lessonId],
    queryFn: () => phase10Api.get(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const attemptsQuery = useQuery({
    queryKey: ['student-practice-attempts', lessonId],
    queryFn: () => practiceApi.listAttempts(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const [phase, setPhase] = useState<Phase>('pre-lab');
  const [session, setSession] = useState<RunningSession | null>(null);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [starting, setStarting] = useState(false);

  if (pcQuery.isLoading) {
    return <div className="h-72 animate-pulse rounded-card bg-surface-2" />;
  }

  const pc = pcQuery.data;
  if (!pc) {
    return (
      <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center text-sm text-muted">
        Bài giảng này chưa có bài thực hành ảo.
      </div>
    );
  }

  // Compose the scoring config the runner needs. PracticeContent.scoringConfig
  // already contains steps + safetyChecklist thanks to Phase 13 editor; fall
  // back to the separate safetyChecklist column if steps are absent.
  const baseConfig = pc.scoringConfig as
    | { steps?: ScoringStepConfig[]; safetyChecklist?: SafetyItemConfig[]; passScore?: number }
    | undefined;
  const safetyFromColumn =
    (pc.safetyChecklist as { items?: SafetyItemConfig[] } | undefined)?.items ?? [];
  const scoringConfig: ScoringConfig = {
    steps: baseConfig?.steps ?? [],
    safetyChecklist:
      baseConfig?.safetyChecklist && baseConfig.safetyChecklist.length > 0
        ? baseConfig.safetyChecklist
        : safetyFromColumn,
    passScore: pc.passScore,
    timeLimit: pc.timeLimit ?? null,
  };

  const objectives = Array.isArray(pc.objectives) ? (pc.objectives as string[]) : [];
  const attemptHistory = attemptsQuery.data ?? [];

  async function handleStart() {
    if (!accessToken || !pc) return;
    if (!pc.webglUrl) {
      toast.error('Giảng viên chưa upload gói WebGL cho bài này');
      return;
    }
    setStarting(true);
    try {
      const attempt = await practiceApi.start(lessonId, accessToken);
      setSession({
        attempt,
        webglUrl: pc.webglUrl,
        startedAt: Date.now(),
      });
      setPhase('running');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Không bắt đầu được bài thực hành';
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  }

  function handleComplete(result: CompleteAttemptResult) {
    if (!session) return;
    const durationSeconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
    const remaining =
      pc?.maxAttempts != null ? Math.max(0, pc.maxAttempts - (attemptHistory.length + 1)) : null;
    setCompleted({
      result,
      durationSeconds,
      scoringConfig: session.attempt.scoringConfig,
      attemptsRemaining: remaining,
    });
    setPhase('post-lab');
    if (result.passed) onPassed?.();
    attemptsQuery.refetch();
  }

  function handleRetry() {
    setCompleted(null);
    setSession(null);
    setPhase('pre-lab');
  }

  // =====================================================
  // Render by phase
  // =====================================================
  if (phase === 'running' && session) {
    return (
      <WebGLRunner
        lessonId={lessonId}
        attemptId={session.attempt.attemptId}
        webglUrl={session.webglUrl}
        scoringConfig={session.attempt.scoringConfig}
        safetyChecklist={session.attempt.safetyChecklist}
        timeLimit={session.attempt.timeLimit}
        studentName={studentName}
        studentId={studentId}
        onComplete={handleComplete}
      />
    );
  }

  if (phase === 'post-lab' && completed) {
    return (
      <PostLabScreen
        result={completed.result}
        durationSeconds={completed.durationSeconds}
        safetyChecklist={completed.scoringConfig.safetyChecklist}
        canRetry={completed.attemptsRemaining === null || completed.attemptsRemaining > 0}
        onRetry={handleRetry}
        onBackToTheory={() => onBackToTheory?.()}
      />
    );
  }

  return (
    <PreLabScreen
      title={pc.introduction.slice(0, 80) || 'Bài thực hành ảo'}
      introduction={pc.introduction}
      objectives={objectives}
      scoringConfig={scoringConfig}
      maxAttempts={pc.maxAttempts}
      attemptHistory={attemptHistory}
      starting={starting}
      onStart={handleStart}
    />
  );
}
