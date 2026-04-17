'use client';

import { Compass, Home, TrendingUp, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Mobile bottom navigation for /student/* routes (Phase 14).
 *
 * Renders only on small screens (< lg) so desktop keeps its dedicated
 * sidebar. 56 px tall per spec; touch targets are ≥ 44 px. The Profile
 * slot is disabled with a "Sắp có" tag until Phase 15 ships it.
 */
const ITEMS = [
  { label: 'Trang chủ', href: '/student/dashboard', icon: Home },
  { label: 'Lộ trình', href: '/student/my-learning', icon: Compass },
  { label: 'Tiến độ', href: '/student/progress', icon: TrendingUp },
  { label: 'Tài khoản', href: null, icon: User },
] as const;

export function StudentBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Điều hướng học viên"
      className="sticky bottom-0 z-40 flex h-14 items-center border-t border-border bg-surface/90 backdrop-blur lg:hidden"
    >
      {ITEMS.map((item) => {
        const active =
          item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        const tone = active ? 'text-primary' : 'text-muted';
        const body = (
          <span className={`flex flex-col items-center gap-0.5 text-[11px] ${tone}`}>
            <item.icon className="h-5 w-5" aria-hidden />
            <span className="leading-none">{item.label}</span>
          </span>
        );
        const cls =
          'relative flex h-14 flex-1 items-center justify-center transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
        if (!item.href) {
          return (
            <div key={item.label} className={`${cls} cursor-not-allowed opacity-50`} title="Sắp có">
              {body}
              <span className="absolute right-1.5 top-1.5 rounded-full bg-surface-2 px-1 text-[8px] font-semibold uppercase text-muted">
                Sắp có
              </span>
            </div>
          );
        }
        return (
          <Link key={item.label} href={item.href} className={cls}>
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
