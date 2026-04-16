'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AppHeader } from '@/components/dashboard/app-header';
import { useAuthStore, useHasHydrated } from '@/lib/auth-store';

/**
 * Admin shell (Phase 09).
 *
 * Sidebar-first layout, dark navy admin sidebar, sticky header.
 *
 * **Hydration guard**: Zustand's `persist` middleware rehydrates from
 * localStorage asynchronously — on the very first render `accessToken`
 * and `user` are both `null` regardless of whether the user is logged
 * in. We must wait for `_hasHydrated === true` before making any auth
 * decision, otherwise every page-load redirects to /login and then
 * immediately back (flash).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useHasHydrated();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Don't redirect until Zustand has finished loading from localStorage.
    if (!hasHydrated) return;

    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (user && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      router.replace('/');
    }
  }, [hasHydrated, accessToken, user, router]);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Show a loading skeleton while Zustand rehydrates — prevents the
  // layout from flashing /login and bouncing back.
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

  // After hydration: if not logged in or not admin, the useEffect above
  // will redirect. Render nothing while that redirect is in flight.
  if (!accessToken || (user && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <AdminSidebar />
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
              <AdminSidebar />
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
