'use client';

import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'prefix' | 'suffix'
> {
  label?: string;
  helper?: string;
  error?: string | null;
  iconPrefix?: LucideIcon;
  iconSuffix?: LucideIcon;
  /** Show "x / max" character count under the field. */
  showCount?: boolean;
}

/**
 * Generic input — labelled, optional helper text, optional error,
 * optional icon prefix / suffix, optional character count.
 *
 * Shows a focus-ring; turns red when `error` is set.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helper,
      error,
      iconPrefix: IconPrefix,
      iconSuffix: IconSuffix,
      showCount,
      maxLength,
      className,
      id,
      value,
      defaultValue,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId().replace(/:/g, '_');
    const fieldId = id ?? `${generatedId}-input`;
    const helperId = `${fieldId}-helper`;
    const errorId = `${fieldId}-error`;

    const currentLength =
      typeof value === 'string'
        ? value.length
        : typeof defaultValue === 'string'
          ? defaultValue.length
          : 0;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          {IconPrefix && (
            <IconPrefix
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
          )}
          <input
            ref={ref}
            id={fieldId}
            value={value}
            defaultValue={defaultValue}
            maxLength={maxLength}
            className={cn(
              'w-full rounded-button border bg-background',
              'h-10 py-2 text-sm text-foreground placeholder:text-muted',
              'outline-none transition-all duration-200',
              'focus:ring-4 focus:ring-primary/20',
              IconPrefix ? 'pl-10' : 'pl-3.5',
              IconSuffix ? 'pr-10' : 'pr-3.5',
              error ? 'border-error focus:border-error' : 'border-border focus:border-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helper ? helperId : undefined}
            {...props}
          />
          {IconSuffix && (
            <IconSuffix
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
          )}
        </div>

        {/* Helper / error / counter row */}
        {(error || helper || (showCount && maxLength)) && (
          <div className="mt-1.5 flex items-start justify-between gap-2 text-xs">
            <div className="flex-1">
              {error ? (
                <p id={errorId} className="text-error" role="alert">
                  {error}
                </p>
              ) : helper ? (
                <p id={helperId} className="text-muted">
                  {helper}
                </p>
              ) : null}
            </div>
            {showCount && maxLength && (
              <span className="text-muted tabular-nums">
                {currentLength}/{maxLength}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
