'use client';

import { cn } from '@lms/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { useState } from 'react';

import { aiApi } from '@/lib/ai';
import { useAuthStore } from '@/lib/auth-store';

interface SuggestedQuestionsProps {
  lessonId: string;
  /**
   * Called when the student clicks a chip. Expected to open the chat
   * widget (parent wires it to a ref / global state) and prefill.
   */
  onPick: (question: string) => void;
}

/**
 * Collapsible "Câu hỏi thường gặp" panel — 5 Gemini-generated chips
 * per lesson (cached 24h server-side via AiSuggestedQuestions table).
 *
 * Hidden when the backend returns no questions (e.g. Gemini offline +
 * no prior cache) — we don't ship an empty section.
 */
export function SuggestedQuestions({ lessonId, onPick }: SuggestedQuestionsProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(true);

  const query = useQuery({
    queryKey: ['ai-suggestions', lessonId],
    queryFn: () => aiApi.getSuggestions(lessonId, accessToken!),
    enabled: !!accessToken,
    staleTime: 10 * 60_000, // 10 min client-side cache on top of server cache
  });

  const questions = query.data?.questions ?? [];
  if (query.isLoading) return null;
  if (questions.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-gradient-to-br from-[#F5F3FF] to-white p-4',
        'dark:border-slate-700 dark:from-[#1E1B4B]/40 dark:to-slate-900',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#1E40AF] text-white">
            <HelpCircle className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Câu hỏi thường gặp
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">({questions.length})</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {questions.map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(q)}
              className={cn(
                'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm transition',
                'hover:border-primary hover:text-primary',
                'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-primary',
              )}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
