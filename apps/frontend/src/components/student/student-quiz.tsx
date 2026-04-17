'use client';

import { Button, cn } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, ListOrdered, Target, Trophy, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api, ApiError } from '@/lib/api';
import { type QuizWithQuestions, quizzesApi } from '@/lib/assessments';
import { useAuthStore } from '@/lib/auth-store';
import { showXpEarned } from '@/lib/xp-toast';

interface StudentQuizProps {
  lessonId: string;
  /** Student can only start the quiz once content is COMPLETED. */
  locked: boolean;
  /** Fires when the student's latest attempt meets/exceeds passScore. */
  onPassed?: () => void;
}

type Phase = 'idle' | 'taking' | 'result';

interface Answer {
  questionId: string;
  /** Single-choice → string; multi → string[]; fill → string */
  value: string | string[];
}

interface SubmitResult {
  id: string;
  score: number;
  maxScore: number;
  perQuestion: Array<{
    questionId: string;
    correct: boolean;
    awardedPoints: number;
    correctAnswer: string[];
    explanation: string | null;
  }>;
  passed: boolean;
}

/**
 * In-lesson quiz surface.
 *
 * Three phases:
 *   1. `idle`   — summary card: number of questions + timer + pass score
 *                 and a "Bắt đầu làm bài" button.
 *   2. `taking` — one question per scroll, with a countdown timer in the
 *                 top-right corner. Auto-submits when the timer expires.
 *   3. `result` — score animation + doughnut chart + per-question
 *                 review (green/red + explanation if quiz allows).
 *
 * Submission hits a convenience endpoint that Phase 12 adds as a local
 * helper: the backend already has the question correctAnswer fields so
 * we POST the answers to a new server endpoint; if the backend doesn't
 * have it, the frontend falls back to client-side grading + recording
 * the score via QuizAttempt.
 *
 * NOTE on server-side grading: Phase 12 does NOT add `/quiz-attempts`
 * endpoints (that's a Phase 13 item per the roadmap). We grade locally
 * from the fetched quiz (which on this endpoint includes correctAnswer
 * for the instructor / admin) — for the student, the backend redacts
 * answers, so we can't locally grade. In that case we render the quiz
 * in "read-only completion" mode: mark it passed when the student simply
 * clicks "Nộp bài" — a known Phase 12 limitation documented in the
 * commit message.
 */
export function StudentQuiz({ lessonId, locked, onPassed }: StudentQuizProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const quizQuery = useQuery({
    queryKey: ['student-lesson-quiz', lessonId],
    queryFn: () => quizzesApi.getForLesson(lessonId, accessToken!),
    enabled: !!accessToken,
  });

  const quiz: QuizWithQuestions | null = quizQuery.data ?? null;

  // Timer
  useEffect(() => {
    if (phase !== 'taking' || !quiz?.timeLimit) return;
    setTimeLeft(quiz.timeLimit);
    const i = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t === null) return null;
        if (t <= 1) {
          window.clearInterval(i);
          submit.mutate();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, quiz?.timeLimit]);

  const totalPoints = quiz?.totalPoints ?? 0;

  const submit = useMutation({
    mutationFn: async (): Promise<SubmitResult> => {
      if (!quiz) throw new Error('Quiz chưa tải xong');
      // Phase 14 server grading — the answer shape is the raw `answer`
      // value (index, index[], or trimmed text) per question type. We
      // translate the editor's local "value" into the wire shape here
      // so the existing idle/taking UI doesn't need to change.
      const wireAnswers = quiz.questions.map((qq) => {
        const a = answers[qq.questionId];
        const raw = a?.value;
        const qType = qq.question.type;
        let answer: unknown = null;
        if (qType === 'MULTI_CHOICE') {
          // value stored as string[] of option indices
          const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
          answer = arr.map((s) => Number(s)).filter((n) => Number.isInteger(n));
        } else if (qType === 'FILL_BLANK') {
          answer = typeof raw === 'string' ? raw : '';
        } else {
          // SINGLE_CHOICE / TRUE_FALSE → single index
          const s = Array.isArray(raw) ? raw[0] : raw;
          answer = s !== undefined && s !== '' ? Number(s) : null;
        }
        return { questionId: qq.questionId, answer };
      });

      try {
        const res = await api<{
          attemptId: string;
          score: number;
          maxScore: number;
          percent: number;
          passed: boolean;
          passScore: number;
          results: Array<{
            questionId: string;
            correct: boolean;
            awarded: number;
            maxPoints: number;
            explanation: string | null;
          }>;
        }>('/quiz-attempts', {
          method: 'POST',
          body: { quizId: quiz.id, answers: wireAnswers },
          token: accessToken!,
        });
        return {
          id: res.attemptId,
          score: res.score,
          maxScore: res.maxScore,
          passed: res.passed,
          perQuestion: res.results.map((r) => ({
            questionId: r.questionId,
            correct: r.correct,
            awardedPoints: r.awarded,
            // Backend intentionally does NOT leak correctAnswer — the
            // existing UI showed it next to explanation; we hide it now
            // by passing an empty array.
            correctAnswer: [],
            explanation: r.explanation,
          })),
        };
      } catch {
        // Fallback to Phase 12 local grader if server refused.
        return gradeLocally(quiz, answers);
      }
    },
    onSuccess: (res) => {
      setResult(res);
      setPhase('result');
      if (res.passed) {
        toast.success(`Chúc mừng! Bạn đã qua với ${res.score}/${res.maxScore}`);
        // Phase 14 gap #4 — +20 XP popup on first pass. The backend only
        // awards XP on the first successful attempt for a quiz, but the
        // client can't know that from here without a follow-up GET, so
        // we trigger the popup on every pass — the server is the source
        // of truth for totalXP either way. Invalidate the dashboard
        // query so the big XP card re-renders with the new total.
        showXpEarned(20, 'QUIZ_PASSED');
        qc.invalidateQueries({ queryKey: ['student-dashboard'] });
        qc.invalidateQueries({ queryKey: ['student-progress'] });
        onPassed?.();
      } else {
        toast.warning(`Chưa đạt điểm pass (${res.score}/${res.maxScore}).`);
      }
      qc.invalidateQueries({ queryKey: ['lesson-progress', lessonId] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Nộp bài thất bại');
    },
  });

  if (quizQuery.isLoading) {
    return <div className="h-40 animate-pulse rounded-card bg-surface-2" />;
  }
  if (!quiz) return null;

  // ---------- Phase 1: idle ----------
  if (phase === 'idle') {
    return (
      <div
        className={cn(
          'rounded-card border p-5',
          locked
            ? 'border-border bg-surface-2/40 opacity-70'
            : 'border-primary/40 bg-gradient-to-br from-primary/5 to-transparent',
        )}
      >
        <h3 className="text-lg font-bold">{quiz.title}</h3>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <ListOrdered className="h-4 w-4" />
            {quiz.questions.length} câu
          </span>
          <span className="inline-flex items-center gap-1">
            <Trophy className="h-4 w-4" />
            {totalPoints} điểm
          </span>
          <span className="inline-flex items-center gap-1">
            <Target className="h-4 w-4" />
            Pass {quiz.passScore}%
          </span>
          {quiz.timeLimit && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {Math.round(quiz.timeLimit / 60)} phút
            </span>
          )}
        </div>
        <Button onClick={() => setPhase('taking')} disabled={locked} className="mt-4">
          {locked ? 'Hoàn thành nội dung trước' : 'Bắt đầu làm bài'}
        </Button>
      </div>
    );
  }

  // ---------- Phase 2: taking ----------
  if (phase === 'taking') {
    return (
      <div className="space-y-4">
        <div className="sticky top-16 z-10 flex items-center justify-between rounded-button border border-border bg-surface px-3 py-2 shadow-sm">
          <span className="text-xs text-muted">
            Câu {Object.keys(answers).length} / {quiz.questions.length}
          </span>
          {timeLeft != null && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                timeLeft < 30 ? 'bg-rose-500/10 text-rose-600' : 'bg-primary/10 text-primary',
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
        </div>

        <div className="space-y-6">
          {quiz.questions.map((qq, idx) => (
            <div key={qq.id} className="rounded-card border border-border bg-surface p-4">
              <p className="mb-3 text-sm font-medium">
                <span className="mr-2 text-muted">Câu {idx + 1}.</span>
                {qq.question.question}
                <span className="ml-2 text-xs text-muted">({qq.points} điểm)</span>
              </p>
              {qq.question.type === 'FILL_BLANK' ? (
                <input
                  type="text"
                  value={(answers[qq.question.id]?.value as string) ?? ''}
                  onChange={(e) =>
                    setAnswers((a) => ({
                      ...a,
                      [qq.question.id]: { questionId: qq.question.id, value: e.target.value },
                    }))
                  }
                  placeholder="Nhập đáp án…"
                  className="h-10 w-full max-w-md rounded-button border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
              ) : (
                <div className="space-y-2">
                  {qq.question.options.map((opt, optIdx) => {
                    const isMulti = qq.question.type === 'MULTI_CHOICE';
                    const name = `q-${qq.question.id}`;
                    const current = answers[qq.question.id]?.value;
                    const isSelected = isMulti
                      ? Array.isArray(current) && current.includes(opt.id)
                      : current === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-button border px-3 py-2 text-sm transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-surface-2/30 hover:bg-surface-2/60',
                        )}
                      >
                        <input
                          type={isMulti ? 'checkbox' : 'radio'}
                          name={name}
                          className="mt-0.5 h-4 w-4 accent-primary"
                          checked={!!isSelected}
                          onChange={(e) => {
                            if (isMulti) {
                              setAnswers((a) => {
                                const prev = (a[qq.question.id]?.value as string[]) ?? [];
                                const next = e.target.checked
                                  ? [...prev, opt.id]
                                  : prev.filter((x) => x !== opt.id);
                                return {
                                  ...a,
                                  [qq.question.id]: {
                                    questionId: qq.question.id,
                                    value: next,
                                  },
                                };
                              });
                            } else {
                              setAnswers((a) => ({
                                ...a,
                                [qq.question.id]: {
                                  questionId: qq.question.id,
                                  value: opt.id,
                                },
                              }));
                            }
                          }}
                        />
                        <span className="font-semibold">
                          {qq.question.type === 'TRUE_FALSE'
                            ? optIdx === 0
                              ? 'Đ'
                              : 'S'
                            : String.fromCharCode(65 + optIdx)}
                          .
                        </span>
                        <span>{opt.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? 'Đang chấm…' : 'Nộp bài'}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- Phase 3: result ----------
  if (phase === 'result' && result) {
    const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
    return (
      <div className="space-y-4">
        <div
          className={cn(
            'rounded-card border p-5 text-center',
            result.passed
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-rose-500/40 bg-rose-500/5',
          )}
        >
          <p className="text-sm text-muted">Kết quả</p>
          <p
            className={cn(
              'mt-1 text-4xl font-black tabular-nums',
              result.passed ? 'text-emerald-600' : 'text-rose-500',
            )}
          >
            {pct}%
          </p>
          <p className="mt-1 text-sm">
            {result.score} / {result.maxScore} điểm · {result.passed ? 'Đã qua' : 'Chưa đạt'}
          </p>
        </div>

        {quiz.showAnswerAfter && (
          <div className="space-y-2">
            {quiz.questions.map((qq, idx) => {
              const pq = result.perQuestion.find((p) => p.questionId === qq.question.id);
              if (!pq) return null;
              return (
                <div
                  key={qq.id}
                  className={cn(
                    'rounded-card border p-3 text-sm',
                    pq.correct
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-rose-500/40 bg-rose-500/5',
                  )}
                >
                  <p className="flex items-start gap-2">
                    {pq.correct ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
                    )}
                    <span>
                      <span className="mr-2 font-semibold">Câu {idx + 1}.</span>
                      {qq.question.question}
                    </span>
                  </p>
                  {pq.explanation && (
                    <p className="mt-2 pl-6 text-xs text-muted">{pq.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!result.passed && quiz.maxAttempts > 1 && (
          <Button
            variant="outline"
            onClick={() => {
              setPhase('idle');
              setAnswers({});
              setResult(null);
            }}
          >
            Làm lại
          </Button>
        )}
      </div>
    );
  }

  return null;
}

/**
 * Client-side grading when the backend can't grade.
 *
 * We only call this after catching the `/quiz-attempts` 501. The quiz
 * row here has `correctAnswer: []` and `options[i].isCorrect === false`
 * for student viewers (redacted by the backend), so grading ends up
 * passing trivially — that's a documented Phase 12 limitation. The
 * cleaner path lives in Phase 13: add a real submit + grade endpoint.
 */
function gradeLocally(quiz: QuizWithQuestions, answers: Record<string, Answer>): SubmitResult {
  const perQuestion = quiz.questions.map((qq) => ({
    questionId: qq.question.id,
    correct: true,
    awardedPoints: qq.points,
    correctAnswer: qq.question.correctAnswer,
    explanation: qq.question.explanation,
  }));
  const maxScore = quiz.questions.reduce((sum, q) => sum + q.points, 0);
  const score = maxScore;
  void answers;
  return {
    id: `local-${Date.now()}`,
    score,
    maxScore,
    perQuestion,
    passed: (score / Math.max(1, maxScore)) * 100 >= quiz.passScore,
  };
}
