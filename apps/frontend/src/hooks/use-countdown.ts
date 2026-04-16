'use client';

import { useEffect, useState } from 'react';

/**
 * Simple countdown hook — returns remaining seconds.
 * Resets whenever `seconds` arg changes.
 */
export function useCountdown(seconds: number): number {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    if (seconds <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [seconds]);

  return remaining;
}

export function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
