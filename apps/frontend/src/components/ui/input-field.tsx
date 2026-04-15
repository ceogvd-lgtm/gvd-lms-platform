'use client';

import { cn } from '@lms/ui';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import * as React from 'react';

export interface InputFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'prefix'
> {
  label: string;
  icon?: LucideIcon;
  error?: string | null;
  togglePassword?: boolean;
}

/**
 * Input with icon prefix, floating-style label, focus-ring animation, and
 * inline error (red border + message). Supports optional show/hide toggle
 * for password fields.
 */
export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  (
    { label, icon: Icon, error, togglePassword = false, type = 'text', className, id, ...props },
    ref,
  ) => {
    const [visible, setVisible] = React.useState(false);
    // useId must be called unconditionally per rules-of-hooks; we use the
    // prop `id` if supplied, otherwise fall back to the generated one.
    const generatedId = React.useId().replace(/:/g, '_');
    const fieldId = id ?? `${generatedId}-input`;
    const inputType =
      togglePassword && type === 'password' ? (visible ? 'text' : 'password') : type;

    return (
      <div className="w-full">
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
        <div className="relative">
          {Icon && (
            <Icon
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          )}
          <input
            ref={ref}
            id={fieldId}
            type={inputType}
            className={cn(
              'w-full rounded-button border bg-white dark:bg-dark-surface',
              'text-slate-900 dark:text-slate-100 placeholder:text-slate-400',
              'h-12 py-2.5 text-sm outline-none transition-all duration-200',
              'focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-900/40',
              Icon ? 'pl-11' : 'pl-4',
              togglePassword ? 'pr-11' : 'pr-4',
              error
                ? 'border-red-500 focus:border-red-500'
                : 'border-slate-200 dark:border-slate-700 focus:border-primary',
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            {...props}
          />
          {togglePassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setVisible((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          )}
        </div>
        {error && (
          <p id={`${fieldId}-error`} className="mt-1.5 text-xs text-red-500" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
InputField.displayName = 'InputField';
