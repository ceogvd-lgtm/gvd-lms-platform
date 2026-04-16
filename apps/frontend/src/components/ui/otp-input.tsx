'use client';

import { cn } from '@lms/ui';
import * as React from 'react';

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * 6-box OTP input:
 *  - auto-focus first box on mount
 *  - auto-advance on digit entry
 *  - backspace moves to previous box
 *  - paste (with 6-digit string) fills all boxes at once
 *  - arrow-left / arrow-right navigation
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  error,
  autoFocus = true,
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const digits = React.useMemo(() => {
    const arr = value.split('').slice(0, length);
    while (arr.length < length) arr.push('');
    return arr;
  }, [value, length]);

  const setDigitAt = (idx: number, d: string) => {
    const next = digits.slice();
    next[idx] = d;
    onChange(next.join(''));
  };

  const handleChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setDigitAt(idx, '');
      return;
    }
    // Only the last entered digit (in case browser kept old value)
    const d = raw[raw.length - 1]!;
    setDigitAt(idx, d);
    if (idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        setDigitAt(idx, '');
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus();
        setDigitAt(idx - 1, '');
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(length, '').slice(0, length));
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
  };

  return (
    <div
      className="flex items-center justify-center gap-2 sm:gap-3"
      role="group"
      aria-label="Mã OTP 6 chữ số"
    >
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[idx] ?? ''}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Chữ số thứ ${idx + 1}`}
          className={cn(
            'h-14 w-12 sm:h-16 sm:w-14 rounded-button border-2 bg-white dark:bg-dark-surface',
            'text-center text-2xl font-semibold text-slate-900 dark:text-slate-100',
            'outline-none transition-all duration-200',
            'focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/40',
            error
              ? 'border-red-500 focus:border-red-500'
              : 'border-slate-200 dark:border-slate-700 focus:border-primary',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        />
      ))}
    </div>
  );
}
