'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppHeader } from '@/components/dashboard/app-header';
import { AppSidebar } from '@/components/dashboard/app-sidebar';
import { useAuthStore, useHasHydrated } from '@/lib/auth-store';

/**
 * Dashboard shell — fixed sidebar on desktop, drawer on mobile.
 *
 * - Sidebar: 260px expanded / 64px collapsed (toggled via collapse button
 *   on desktop; drawer on mobile).
 * - Header: 64px sticky, backdrop-blur, z-40
 * - Content: padding responsive (16px mobile, 24px tablet, 32px desktop),
 *   max-width 1400px auto-centered
 * - Page transitions: fade + slide-up 200ms via framer-motion AnimatePresence
 *
 * Auth: bounces to /login once hydrated + no access token. Mirrors the
 * guard in (admin)/layout.tsx + (instructor)/layout.tsx so that clicking
 * "Đăng xuất" (which clears the Zustand store) actually navigates away
 * from the dashboard instead of leaving a stale UI behind.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useHasHydrated();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
    }
  }, [hasHydrated, accessToken, router]);

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

  if (!accessToken) return null; // useEffect will redirect

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AppSidebar />
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
              <AppSidebar />
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
