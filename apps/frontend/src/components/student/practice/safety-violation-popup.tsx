'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { SafetyItemConfig } from '@/lib/practice';

interface SafetyViolationPopupProps {
  item: SafetyItemConfig;
  /** Dismiss only enabled after a 3-second delay per spec. */
  onDismiss: () => void;
}

/**
 * Full-screen red modal that pops when the Unity build reports a
 * critical safety violation. Intentionally non-dismissible for the
 * first 3 seconds — operators must read it before they can continue.
 */
export function SafetyViolationPopup({ item, onDismiss }: SafetyViolationPopupProps) {
  const [secondsLeft, setSecondsLeft] = useState(3);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  const canDismiss = secondsLeft <= 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-rose-600/90 backdrop-blur-sm"
      role="alertdialog"
      aria-labelledby="safety-title"
      aria-describedby="safety-desc"
    >
      <div className="mx-4 max-w-lg rounded-card bg-white p-8 text-center shadow-2xl dark:bg-slate-900">
        <AlertTriangle className="mx-auto mb-4 h-16 w-16 animate-pulse text-rose-500" />
        <h2 id="safety-title" className="text-2xl font-black text-rose-600">
          VI PHẠM AN TOÀN
        </h2>
        <p id="safety-desc" className="mt-3 text-base font-semibold">
          {item.description ?? item.safetyId}
        </p>
        <p className="mt-3 text-sm text-muted">
          Vi phạm nghiêm trọng sẽ bị trừ 20% điểm tổng. Hãy đọc kỹ quy tắc an toàn và thao tác lại
          theo đúng hướng dẫn.
        </p>

        <button
          type="button"
          onClick={canDismiss ? onDismiss : undefined}
          disabled={!canDismiss}
          className={
            'mt-6 inline-flex h-11 min-w-[200px] items-center justify-center rounded-button px-4 text-sm font-semibold transition-colors ' +
            (canDismiss
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'cursor-not-allowed bg-rose-500/50 text-white/80')
          }
        >
          {canDismiss ? 'Hiểu rồi, tiếp tục' : `Đọc kỹ (${secondsLeft}s)`}
        </button>
      </div>
    </div>
  );
}
