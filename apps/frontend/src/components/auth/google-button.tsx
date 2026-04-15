'use client';

import { cn } from '@lms/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function GoogleButton({
  label = 'Đăng nhập bằng Google',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={`${API_URL}/auth/google`}
      className={cn(
        'flex h-12 w-full items-center justify-center gap-3 rounded-button border border-slate-200 dark:border-slate-700',
        'bg-white dark:bg-dark-surface text-sm font-medium text-slate-700 dark:text-slate-200',
        'transition-all duration-200 hover:shadow-md hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100 dark:focus-visible:ring-primary-900/40',
        className,
      )}
    >
      <GoogleLogo />
      {label}
    </a>
  );
}

function GoogleLogo() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M21.35 11.1H12v2.93h5.35c-.23 1.36-1.66 3.99-5.35 3.99-3.21 0-5.84-2.66-5.84-5.94s2.63-5.94 5.84-5.94c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.66 3.75 14.54 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12S6.92 21.2 12 21.2c6.93 0 9.5-4.86 9.5-9.36 0-.63-.07-1.11-.15-1.74z"
        fill="#4285F4"
      />
      <path
        d="M3.96 7.32l3.22 2.36C8.01 7.83 9.85 6.64 12 6.64c1.35 0 2.57.47 3.53 1.24l2.63-2.56C16.66 3.75 14.54 2.8 12 2.8 8.31 2.8 5.13 4.86 3.96 7.32z"
        fill="#EA4335"
      />
      <path
        d="M12 21.2c2.47 0 4.56-.82 6.08-2.22l-2.81-2.3c-.78.53-1.83.9-3.27.9-2.6 0-4.8-1.72-5.58-4.07l-3.2 2.47C4.58 18.78 8.01 21.2 12 21.2z"
        fill="#34A853"
      />
      <path
        d="M21.35 11.1H12v2.93h5.35c-.22 1.26-1.14 2.41-2.08 3.09l2.81 2.3c1.63-1.52 2.57-3.77 2.57-6.58 0-.63-.07-1.11-.15-1.74z"
        fill="#FBBC05"
      />
    </svg>
  );
}
