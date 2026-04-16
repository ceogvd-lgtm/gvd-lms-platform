'use client';

import { Button, cn } from '@lms/ui';
import { ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { SlideDeck } from '@/lib/theory-engine';

interface PptPlayerProps {
  deck: SlideDeck;
  /** Fires when the student lands on the last slide. Used to mark the
   *  lesson's content as done so the completion cascade can fire. */
  onReachedEnd?: () => void;
}

/**
 * Slide viewer for decks produced by the PptConverterService.
 *
 * One slide shown at a time; a thumbnail strip at the bottom gives
 * random access. Keyboard ←/→ move between slides. When the student
 * navigates to the final slide for the first time we emit
 * `onReachedEnd()` — the parent orchestrator translates that into a
 * POST /lessons/:id/complete call.
 *
 * When the backend returned a fallback deck (no LibreOffice), we show
 * the human-readable message and a link to download the raw .pptx so
 * students aren't blocked.
 */
export function PptPlayer({ deck, onReachedEnd }: PptPlayerProps) {
  const [index, setIndex] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);

  const onPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const onNext = useCallback(
    () => setIndex((i) => Math.min(deck.slides.length - 1, i + 1)),
    [deck.slides.length],
  );

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onPrev]);

  // Fire onReachedEnd once when user sees the final slide.
  useEffect(() => {
    if (deck.slides.length === 0) return;
    if (index === deck.slides.length - 1 && !reachedEnd) {
      setReachedEnd(true);
      onReachedEnd?.();
    }
  }, [index, deck.slides.length, reachedEnd, onReachedEnd]);

  // Fallback deck — conversion unavailable.
  if (deck.converter === 'fallback' || deck.slides.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-border bg-surface-2/40 p-10 text-center">
        <p className="text-sm font-semibold">{deck.message ?? 'Slides chưa sẵn sàng'}</p>
        <p className="text-xs text-muted">
          Giảng viên đã tải lên file PowerPoint nhưng máy chủ chưa cài LibreOffice để convert.
        </p>
      </div>
    );
  }

  const current = deck.slides[index]!;

  return (
    <div className="flex flex-col gap-3">
      {/* Stage */}
      <div className="relative overflow-hidden rounded-card border border-border bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.imageUrl}
          alt={`Slide ${current.index}`}
          className="h-auto w-full object-contain"
        />
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
            Slide {index + 1} / {deck.slides.length}
          </span>
        </div>
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onPrev} disabled={index === 0}>
          <ChevronLeft className="h-4 w-4" />
          Slide trước
        </Button>
        <a
          href={`/api/v1/minio/${encodeURIComponent(deck.sourceKey)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted hover:text-primary"
        >
          <FileDown className="mr-1 inline h-3.5 w-3.5" />
          Tải .pptx gốc
        </a>
        <Button onClick={onNext} disabled={index === deck.slides.length - 1}>
          Slide tiếp theo
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto py-2">
        {deck.slides.map((s, idx) => (
          <button
            type="button"
            key={s.index}
            onClick={() => setIndex(idx)}
            className={cn(
              'shrink-0 overflow-hidden rounded border-2 transition-colors',
              idx === index ? 'border-primary' : 'border-border hover:border-primary/50',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.imageUrl}
              alt={`Slide ${s.index}`}
              className="block h-16 w-28 object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
