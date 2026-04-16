'use client';

import { cn } from '@lms/ui';
import { CheckCircle2, XCircle } from 'lucide-react';

/* eslint-disable import/order -- prettier re-sorts sibling imports above the alias group */
import { DifficultyBadge } from './difficulty-badge';
import { QuestionTypeBadge } from './question-type-badge';

import type { QuestionBank } from '@/lib/assessments';
/* eslint-enable import/order */

interface QuestionPreviewProps {
  question: QuestionBank;
  /** Show which options are correct (instructor preview). */
  revealAnswers?: boolean;
  /** Optional question number for "Câu X" header. */
  index?: number;
  className?: string;
}

/**
 * Student-facing render of a question. When `revealAnswers` is true the
 * correct options are highlighted — used in the instructor preview modal.
 */
export function QuestionPreview({
  question,
  revealAnswers,
  index,
  className,
}: QuestionPreviewProps) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-4 shadow-sm', className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {typeof index === 'number' && (
          <span className="font-semibold text-muted">Câu {index + 1}</span>
        )}
        <QuestionTypeBadge type={question.type} />
        <DifficultyBadge difficulty={question.difficulty} />
        <span className="text-muted">· {question.points} điểm</span>
      </div>

      <p className="mb-4 whitespace-pre-wrap text-sm font-medium leading-relaxed">
        {question.question}
      </p>

      {question.type === 'FILL_BLANK' ? (
        <div>
          <input
            type="text"
            placeholder="Nhập đáp án…"
            disabled
            className="w-full max-w-md rounded-button border border-border bg-surface-2/40 px-3 py-2 text-sm outline-none"
          />
          {revealAnswers && question.options.some((o) => o.isCorrect) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="text-muted">Đáp án chấp nhận:</span>
              {question.options
                .filter((o) => o.isCorrect)
                .map((o) => (
                  <span
                    key={o.id}
                    className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    {o.text}
                  </span>
                ))}
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {question.options.map((opt, idx) => {
            const selected = false;
            const correct = opt.isCorrect && revealAnswers;
            return (
              <li
                key={opt.id}
                className={cn(
                  'flex items-start gap-2 rounded-button border px-3 py-2 text-sm',
                  correct
                    ? 'border-emerald-500/60 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                    : 'border-border bg-surface-2/30',
                )}
              >
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-[10px] font-bold">
                  {question.type === 'TRUE_FALSE'
                    ? idx === 0
                      ? 'Đ'
                      : 'S'
                    : String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1">{opt.text}</span>
                {revealAnswers && (
                  <span className="mt-0.5" aria-hidden>
                    {opt.isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : selected ? (
                      <XCircle className="h-4 w-4 text-rose-500" />
                    ) : null}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {revealAnswers && question.explanation && (
        <div className="mt-4 rounded-button border border-primary/40 bg-primary/5 p-3 text-sm">
          <span className="font-semibold text-primary">Giải thích: </span>
          <span className="whitespace-pre-wrap text-foreground">{question.explanation}</span>
        </div>
      )}
    </div>
  );
}
