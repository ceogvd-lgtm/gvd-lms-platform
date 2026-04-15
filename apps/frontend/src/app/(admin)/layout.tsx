'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuthStore } from '@/lib/auth-store';

/**
 * Client-side admin shell. The REAL permission enforcement is on the
 * backend — this layout just redirects non-admins away from the /admin/*
 * subtree so they don't see empty pages.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (user && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      router.replace('/');
    }
  }, [accessToken, user, router]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-bg">
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/admin/users" className="text-lg font-bold text-primary">
              LMS Admin
            </Link>
            <nav className="flex gap-6 text-sm font-medium">
              <Link
                href="/admin/users"
                className="text-slate-700 hover:text-primary dark:text-slate-300"
              >
                Users
              </Link>
              <Link
                href="/admin/audit-log"
                className="text-slate-700 hover:text-primary dark:text-slate-300"
              >
                Audit Log
              </Link>
            </nav>
          </div>
          {user && (
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {user.name} <span className="text-xs text-slate-400">({user.role})</span>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
