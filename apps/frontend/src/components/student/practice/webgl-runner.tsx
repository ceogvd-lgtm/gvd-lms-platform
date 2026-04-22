'use client';

import { cn } from '@lms/ui';
import { Clock, ListOrdered, Loader2, Trophy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

/* eslint-disable import/order -- prettier re-sorts the sibling import above aliases; keep build green */
import { SafetyViolationPopup } from './safety-violation-popup';

import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  practiceApi,
  type CompleteAttemptResult,
  type ScoringConfig,
  type SafetyItemConfig,
} from '@/lib/practice';
/* eslint-enable import/order */

interface WebGLRunnerProps {
  lessonId: string;
  attemptId: string;
  webglUrl: string;
  scoringConfig: ScoringConfig;
  safetyChecklist: SafetyItemConfig[];
  /** Total time allowed in seconds (from scoring config). null = no limit. */
  timeLimit: number | null;
  studentName: string;
  studentId: string;
  onComplete: (result: CompleteAttemptResult) => void;
}

interface IncomingAction {
  type: 'LMS_ACTION';
  payload: {
    stepId: string;
    isCorrect: boolean;
    isInOrder?: boolean;
    isSafe?: boolean;
    safetyViolationId?: string;
    score?: number;
  };
}

interface IncomingComplete {
  type: 'LMS_COMPLETE';
  payload: {
    stepsResult: Array<{ stepId: string; isCorrect: boolean; isInOrder?: boolean }>;
    safetyViolations: Array<{ safetyId: string; timestamp?: number }>;
    duration: number;
  };
}

type IncomingMessage = IncomingAction | IncomingComplete;

function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Mounts the Unity WebGL iframe + bridges window.postMessage traffic to
 * the Phase-13 backend endpoints:
 *
 *   Outbound (parent → iframe):
 *     unityInstance.SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(config))
 *
 *   Inbound (iframe → parent):
 *     { type: 'LMS_ACTION',   payload: { stepId, isCorrect, ... } }  → POST /practice/action
 *     { type: 'LMS_COMPLETE', payload: { stepsResult, safetyViolations, duration } } → POST /practice/complete
 *
 * The iframe gets sandbox="allow-same-origin allow-scripts" so the
 * Unity loader can run WASM + do XHR within its own origin, but it
 * can't navigate the parent.
 *
 * We also manage:
 *   - a semi-transparent HUD (timer + score + step progress)
 *   - a full-screen red popup on critical safety violations (per spec,
 *     delayed 3 s before user can dismiss)
 *   - a countdown timer that auto-submits via the LMS_COMPLETE path
 *     when it hits zero (using the stepsResult we've been accumulating
 *     from LMS_ACTION events)
 */
export function WebGLRunner({
  lessonId,
  attemptId,
  webglUrl,
  scoringConfig,
  safetyChecklist,
  timeLimit,
  studentName,
  studentId,
  onComplete,
}: WebGLRunnerProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const startedAtRef = useRef<number>(Date.now());
  const stepsResultRef = useRef<
    Map<string, { stepId: string; isCorrect: boolean; isInOrder?: boolean }>
  >(new Map());
  const violationsRef = useRef<Array<{ safetyId: string; timestamp: number }>>([]);
  const finishedRef = useRef(false);

  const safetyById = useMemo(
    () => new Map(safetyChecklist.map((s) => [s.safetyId, s])),
    [safetyChecklist],
  );

  const totalSteps = scoringConfig.steps.length;
  const [completedSteps, setCompletedSteps] = useState(0);
  const [liveScore, setLiveScore] = useState(0);
  const [maxScore] = useState(() => scoringConfig.steps.reduce((sum, s) => sum + s.maxPoints, 0));
  const [timeLeft, setTimeLeft] = useState<number | null>(timeLimit != null ? timeLimit : null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [activeSafetyViolation, setActiveSafetyViolation] = useState<SafetyItemConfig | null>(null);

  // =====================================================
  // Send config to Unity once the iframe loads.
  // We wait a short tick so the Unity bootstrap can attach `window.unityInstance`.
  // =====================================================
  useEffect(() => {
    if (!iframeLoaded) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const payload = {
      studentId,
      studentName,
      lessonId,
      attemptId,
      scoringConfig,
    };
    // First: try the "unityInstance" global injected by Builds.loader.js.
    // This is the official path. If it's not there yet we also broadcast
    // a message so the Unity JS plugin can pick it up.
    const attempt = (tries: number) => {
      try {
        const w = win as unknown as {
          unityInstance?: {
            SendMessage: (go: string, fn: string, arg: string) => void;
          };
        };
        if (w.unityInstance) {
          w.unityInstance.SendMessage('LMSBridge', 'ReceiveConfig', JSON.stringify(payload));
          return;
        }
      } catch {
        // Cross-origin or Unity not ready — fall through.
      }
      if (tries > 0) {
        window.setTimeout(() => attempt(tries - 1), 500);
      } else {
        // Final fallback: postMessage — Unity's JS plugin can subscribe.
        try {
          win.postMessage({ type: 'LMS_CONFIG', payload }, '*');
        } catch {
          // give up; content pack will show its own error
        }
      }
    };
    attempt(10);
  }, [iframeLoaded, studentId, studentName, lessonId, attemptId, scoringConfig]);

  // =====================================================
  // Inbound bridge — listen for LMS_ACTION / LMS_COMPLETE
  // =====================================================
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as IncomingMessage | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'LMS_ACTION') {
        handleAction(data);
      } else if (data.type === 'LMS_COMPLETE') {
        void handleComplete(data);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // =====================================================
  // Timer
  // =====================================================
  useEffect(() => {
    if (timeLeft == null) return;
    if (timeLeft <= 0) {
      // Auto-submit when the clock hits 0 — synthesise a complete event
      // from whatever steps we've recorded so far.
      if (!finishedRef.current) {
        void autoSubmit();
      }
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((v) => (v == null ? v : v - 1)), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  // =====================================================
  // Handlers
  // =====================================================
  function handleAction(evt: IncomingAction) {
    if (!accessToken) return;
    const p = evt.payload;

    // Track step result for end-of-attempt summary.
    stepsResultRef.current.set(p.stepId, {
      stepId: p.stepId,
      isCorrect: p.isCorrect,
      isInOrder: p.isInOrder,
    });
    setCompletedSteps(stepsResultRef.current.size);

    // Track violation + surface popup on critical.
    if (p.isSafe === false && p.safetyViolationId) {
      const item = safetyById.get(p.safetyViolationId);
      if (item) {
        violationsRef.current.push({ safetyId: p.safetyViolationId, timestamp: Date.now() });
        if (item.isCritical) {
          setActiveSafetyViolation(item);
        }
      }
    }

    if (p.isCorrect && typeof p.score === 'number') {
      setLiveScore((v) => v + p.score!);
    }

    // Fire-and-forget POST — we don't block the UI on the round-trip.
    practiceApi
      .action(
        {
          attemptId,
          stepId: p.stepId,
          isCorrect: p.isCorrect,
          isInOrder: p.isInOrder,
          isSafe: p.isSafe,
          safetyViolationId: p.safetyViolationId,
          score: p.score,
          timestamp: Date.now(),
        },
        accessToken,
      )
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[practice] action failed', err);
      });
  }

  async function handleComplete(evt: IncomingComplete) {
    if (!accessToken || finishedRef.current) return;
    finishedRef.current = true;
    const p = evt.payload;
    try {
      const res = await practiceApi.complete(
        {
          attemptId,
          duration: p.duration ?? Math.floor((Date.now() - startedAtRef.current) / 1000),
          stepsResult: p.stepsResult,
          safetyViolations: p.safetyViolations,
        },
        accessToken,
      );
      onComplete(res);
    } catch (err) {
      finishedRef.current = false; // allow retry
      toast.error(err instanceof ApiError ? err.message : 'Hoàn tất thất bại');
    }
  }

  async function autoSubmit() {
    if (finishedRef.current || !accessToken) return;
    finishedRef.current = true;
    try {
      const stepsResult = Array.from(stepsResultRef.current.values());
      const res = await practiceApi.complete(
        {
          attemptId,
          duration: Math.floor((Date.now() - startedAtRef.current) / 1000),
          stepsResult,
          safetyViolations: violationsRef.current,
        },
        accessToken,
      );
      toast.warning('Hết giờ — đã tự nộp bài');
      onComplete(res);
    } catch (err) {
      finishedRef.current = false;
      toast.error(err instanceof ApiError ? err.message : 'Auto-submit thất bại');
    }
  }

  const progressPct = Math.min(
    100,
    totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
  );

  return (
    <div className="relative -mx-4 -my-6 md:-mx-6">
      {/* Stage — dark backdrop filling the lesson viewport; centres the 16:9
          stage inside. Padding gives a bit of gutter on very large screens so
          the canvas doesn't kiss the window edges. */}
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-black p-2 md:p-4">
        {/* 16:9 stage — Unity's canvas is native 1920×1080; forcing the iframe
            to 16:9 prevents the engine from scaling itself into a squished
            portrait shape on tall monitors (the old layout stretched the
            iframe to the full viewport height and Unity's internal scaler
            matched the CSS size, cutting off controls). We bound BOTH axes:
              - width:  min(100%, available-height × 16/9)
              - height: implicit from aspect-ratio
            so the stage never overflows the viewport in either orientation. */}
        <div
          className="relative overflow-hidden rounded-lg shadow-2xl"
          style={{
            aspectRatio: '16 / 9',
            width: 'min(100%, calc((100vh - 96px) * 16 / 9))',
          }}
        >
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-semibold text-white">Đang tải bài thực hành…</p>
                <p className="max-w-xs text-center text-xs text-white/60">
                  Mẹo: đảm bảo bạn đã đọc quy tắc an toàn trước khi bắt đầu thao tác.
                </p>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={webglUrl}
            title="Virtual Lab"
            onLoad={() => setIframeLoaded(true)}
            className="block h-full w-full border-0 bg-black"
            sandbox="allow-same-origin allow-scripts allow-pointer-lock allow-popups allow-forms"
            allow="autoplay; fullscreen; gamepad; xr-spatial-tracking"
          />

          {/* HUD overlay — lives inside the 16:9 frame so the chips never
              float over the black letterbox gutters. */}
          <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
            {timeLeft != null && (
              <div
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold text-white backdrop-blur',
                  timeLeft < 30 ? 'bg-rose-600/85' : 'bg-black/60',
                )}
              >
                <Clock className="mr-1 inline h-3.5 w-3.5" />
                {fmtClock(timeLeft)}
              </div>
            )}
            <div className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              <Trophy className="mr-1 inline h-3.5 w-3.5" />
              {liveScore} / {maxScore}
            </div>
            <div className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              <ListOrdered className="mr-1 inline h-3.5 w-3.5" />
              {completedSteps}/{totalSteps} · {progressPct}%
            </div>
          </div>
        </div>
      </div>

      {/* Safety violation popup */}
      {activeSafetyViolation && (
        <SafetyViolationPopup
          item={activeSafetyViolation}
          onDismiss={() => setActiveSafetyViolation(null)}
        />
      )}
    </div>
  );
}
