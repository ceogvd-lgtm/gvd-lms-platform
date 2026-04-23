'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppHeader } from '@/components/dashboard/app-header';
import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { StudentBottomNav } from '@/components/student/student-bottom-nav';
import { useAuthStore, useHasHydrated } from '@/lib/auth-store';

/**
 * Student shell.
 *
 * Layout decisions:
 *   - Desktop (≥lg): 260 px navigation sidebar on the left (`AppSidebar`
 *     with STUDENT items: Tổng quan / Khoá học / Tiến độ / Cài đặt). The
 *     list pages (/student/dashboard, /my-learning, /progress) otherwise
 *     float alone on a 1920×1080 screen and feel unfinished.
 *   - Lesson detail page (`/student/lessons/[id]`) is the one exception:
 *     it already owns a chapter-outline sidebar, so rendering the nav
 *     sidebar here too would push the Unity WebGL stage into a narrow
 *     column on 13" laptops. We hide the sidebar on that route only —
 *     students jump back via the header logo or browser back button.
 *   - Mobile (<lg): `StudentBottomNav` handles navigation in a 56 px
 *     bottom bar; the sidebar is hidden behind a drawer opened from the
 *     header hamburger, matching the `(dashboard)` shell.
 *
 * Hydration guard via `useHasHydrated()` so a refresh on /student/*
 * doesn't bounce to /login while Zustand reads from localStorage.
 */
const ALLOWED_ROLES = new Set(['STUDENT', 'INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']);

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useHasHydrated();

  const [mobileOpen, setMobileOpen] = useState(false);
  // The lesson detail page has its own chapter-outline sidebar; suppress
  // ours there so students get the full 16:9 Unity stage.
  const hideSidebar = pathname.startsWith('/student/lessons/');

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
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — hidden on lesson detail where outline sidebar lives */}
      {!hideSidebar && (
        <div className="hidden lg:block">
          <AppSidebar />
        </div>
      )}

      {/* Mobile drawer — available on list pages only, same suppression rule */}
      {!hideSidebar && (
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
                <AppSidebar />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onToggleSidebar={hideSidebar ? undefined : () => setMobileOpen((o) => !o)} />
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

      {/* Bottom nav stays for mobile — complementary to the drawer sidebar */}
      <StudentBottomNav />
    </div>
  );
}
