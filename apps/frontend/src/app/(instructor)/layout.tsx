'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppHeader } from '@/components/dashboard/app-header';
import { InstructorSidebar } from '@/components/instructor/instructor-sidebar';
import { useAuthStore, useHasHydrated } from '@/lib/auth-store';

/**
 * Instructor shell (Phase 10).
 *
 * Mirrors the Phase 09 admin shell with two differences:
 *   1. Sidebar is `InstructorSidebar` (blue navy + amber).
 *   2. Role gate accepts INSTRUCTOR + ADMIN + SUPER_ADMIN.
 *
 * Hydration guard via `useHasHydrated()` — same fix that Phase 09
 * shipped, so refreshing /instructor/* doesn't bounce the user to
 * /login while Zustand reads from localStorage.
 */
const ALLOWED_ROLES = new Set(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']);

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useHasHydrated();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Close mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
    return null; // useEffect will redirect
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — sticky keeps the nav in view while the page
          content scrolls underneath. See (admin)/layout.tsx for rationale. */}
      <div className="sticky top-0 hidden h-screen lg:block">
        <InstructorSidebar />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <InstructorSidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onToggleSidebar={() => setMobileOpen((o) => !o)} />

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
