'use client';

import { Trophy } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Phase 14 gap #4 — "+XP earned" popup.
 *
 * Renders a sonner custom toast with:
 *   - Trophy icon (pulses once on mount for emphasis)
 *   - "+{amount} XP" headline
 *   - short Vietnamese reason line
 *
 * Keyframes live in globals.css (`@keyframes xp-pulse`) so the component
 * is pure JSX + Tailwind classes. Stays open 3.5s (longer than a
 * default toast because the animation needs room to breathe).
 */
export type XpReason = 'LESSON_COMPLETED' | 'QUIZ_PASSED' | 'COURSE_COMPLETED';

const REASON_LABEL: Record<XpReason, string> = {
  LESSON_COMPLETED: 'Hoàn thành bài giảng',
  QUIZ_PASSED: 'Qua bài kiểm tra',
  COURSE_COMPLETED: 'Hoàn thành khoá học',
};

export function showXpEarned(amount: number, reason: XpReason): void {
  toast.custom(
    (id) => (
      // <button> (not a role=status div) so the click-to-dismiss handler
      // satisfies a11y rules — it's still announced to screen-readers
      // via aria-live. Block layout preserved via flex classes.
      <button
        type="button"
        className="xp-toast flex items-center gap-3 rounded-card border border-primary/40 bg-gradient-to-r from-primary/15 via-background to-background px-4 py-3 text-left shadow-lg backdrop-blur"
        aria-live="polite"
        onClick={() => toast.dismiss(id)}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary xp-trophy">
          <Trophy className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-primary">+{amount} XP</span>
          <span className="block text-xs text-muted">{REASON_LABEL[reason]}</span>
        </span>
      </button>
    ),
    { duration: 3500 },
  );
}
