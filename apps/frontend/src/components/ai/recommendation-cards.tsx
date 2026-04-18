'use client';

import { Card, CardContent, cn } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, Dumbbell, Sparkles, X } from 'lucide-react';
import Link from 'next/link';

import { aiApi, type AiRecommendationRow } from '@/lib/ai';
import { useAuthStore } from '@/lib/auth-store';

/**
 * "Gợi ý từ AI" row on the student dashboard (Row 7, Phase 17).
 *
 * - Hidden entirely when there are no unread recommendations (empty
 *   state is the *absence* of the row, not an "empty" card).
 * - Card icon depends on the heuristic type:
 *     REVIEW_LESSON  → BookOpen
 *     PRACTICE_MORE  → Dumbbell
 *     SAFETY_REMINDER → AlertTriangle
 *     ADAPTIVE       → Sparkles
 * - Dismiss (X) marks the row read optimistically; the mutation rolls
 *   back the UI if the API call fails.
 */
export function AiRecommendationCards() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['ai-recommendations'],
    queryFn: () => aiApi.listRecommendations(accessToken!),
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => aiApi.markRecommendationRead(id, accessToken!),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['ai-recommendations'] });
      const prev = qc.getQueryData<{ data: AiRecommendationRow[] }>(['ai-recommendations']);
      qc.setQueryData<{ data: AiRecommendationRow[] }>(['ai-recommendations'], (old) => ({
        data: (old?.data ?? []).filter((r) => r.id !== id),
      }));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ai-recommendations'], ctx.prev);
    },
  });

  const items = query.data?.data ?? [];
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#7C3AED]" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Gợi ý từ AI</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {items.length}
        </span>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((rec) => (
          <RecommendationCard key={rec.id} rec={rec} onDismiss={() => dismissMut.mutate(rec.id)} />
        ))}
      </div>
    </section>
  );
}

function RecommendationCard({
  rec,
  onDismiss,
}: {
  rec: AiRecommendationRow;
  onDismiss: () => void;
}) {
  const { Icon, tint } = typeMeta(rec.type);
  return (
    <Card
      className={cn(
        'relative overflow-hidden border-transparent',
        'bg-gradient-to-br from-[#F5F3FF] to-[#EFF6FF]',
        'dark:from-[#1E1B4B]/60 dark:to-[#1E3A8A]/40',
      )}
    >
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
              tint,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <p className="flex-1 text-sm leading-relaxed text-slate-800 dark:text-slate-100">
            {rec.content}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-200/50 hover:text-slate-700 dark:hover:bg-slate-700/50 dark:hover:text-slate-200"
            aria-label="Đã đọc"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {rec.lesson && (
          <Link
            href={`/student/lessons/${rec.lesson.id}`}
            className="inline-flex w-fit items-center gap-1 rounded-lg bg-white/60 px-2 py-1 text-xs font-medium text-primary transition hover:bg-white dark:bg-slate-900/60 dark:hover:bg-slate-900"
          >
            Mở bài: {rec.lesson.title}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function typeMeta(type: string): { Icon: typeof BookOpen; tint: string } {
  switch (type) {
    case 'REVIEW_LESSON':
      return { Icon: BookOpen, tint: 'bg-blue-500' };
    case 'PRACTICE_MORE':
      return { Icon: Dumbbell, tint: 'bg-emerald-500' };
    case 'SAFETY_REMINDER':
      return { Icon: AlertTriangle, tint: 'bg-amber-500' };
    case 'ADAPTIVE':
    default:
      return { Icon: Sparkles, tint: 'bg-gradient-to-br from-[#7C3AED] to-[#1E40AF]' };
  }
}
