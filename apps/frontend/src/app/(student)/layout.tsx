'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AppHeader } from '@/components/dashboard/app-header';
import { useAuthStore, useHasHydrated } from '@/lib/auth-store';

/**
 * Student shell (Phase 12).
 *
 * Unlike the admin / instructor shells which dedicate ~240 px to a
 * navigation sidebar, the student layout stays intentionally minimal —
 * the lesson page itself owns its own outline sidebar, so rendering a
 * second one here would fight for screen real estate on 13" laptops.
 *
 * Hydration guard via `useHasHydrated()` (same as Phase 09+) so a
 * refresh on /student/* doesn't bounce to /login while Zustand reads
 * from localStorage.
 */
const ALLOWED_ROLES = new Set(['STUDENT', 'INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']);

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useHasHydrated();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (user && !ALLOWED_ROLES.has(user.role)) {
      router.replace('/');
    }
  }, [hasHydrated, accessToken, user, router]);

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted">Đang tải…</p>
        </div>
      </div>
    );
  }

  if (!accessToken || (user && !ALLOWED_ROLES.has(user.role))) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="flex-1 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="min-h-[calc(100vh-64px)]"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
