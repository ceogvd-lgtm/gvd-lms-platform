'use client';

import { Sidebar, type SidebarItem } from '@lms/ui';
import { BarChart3, BookOpen, LayoutDashboard, LayoutGrid, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { GvdLogo } from '@/components/brand/gvd-logo';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Instructor sidebar (Phase 10).
 *
 * Visible to INSTRUCTOR + ADMIN+. ADMIN+ also gets a shortcut into the
 * curriculum tree (Phase 08 admin tool).
 *
 * Color scheme: blue navy with amber accent — distinct from the admin
 * sidebar (slate-900) so the user instantly knows which workspace
 * they're in.
 */
interface InstructorSidebarProps {
  collapsed?: boolean;
}

export function InstructorSidebar({ collapsed = false }: InstructorSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const role = user?.role;

  const items: SidebarItem[] = useMemo(() => {
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

    const base: SidebarItem[] = [
      {
        label: 'Tổng quan',
        href: '/instructor/dashboard',
        icon: LayoutDashboard,
        active: isActive('/instructor/dashboard'),
      },
      {
        label: 'Khoá học của tôi',
        href: '/instructor/courses',
        // Tạo khoá mới sub-route shouldn't double-highlight
        active: pathname === '/instructor/courses',
        icon: BookOpen,
      },
      {
        label: 'Tạo khoá mới',
        href: '/instructor/courses/new',
        icon: Plus,
        active: isActive('/instructor/courses/new'),
      },
      {
        label: 'Analytics',
        href: '/instructor/analytics',
        icon: BarChart3,
        active: isActive('/instructor/analytics'),
      },
    ];

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      base.push({
        label: 'Curriculum',
        href: '/admin/curriculum',
        icon: LayoutGrid,
        active: isActive('/admin/curriculum'),
      });
    }

    return base;
  }, [pathname, role]);

  return (
    <Sidebar
      collapsed={collapsed}
      items={items}
      // Blue navy theme to distinguish from the admin (slate) sidebar.
      className="bg-blue-700 dark:bg-blue-950 border-r-blue-800 text-blue-50"
      brand={
        <Link
          href="/instructor/dashboard"
          className="flex items-center gap-2.5 font-bold text-white"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-button bg-amber-400 text-blue-900">
            <GvdLogo className="h-7 w-7" />
          </span>
          {!collapsed && (
            <span className="text-base">
              GVD <span className="text-amber-300">Instructor</span>
            </span>
          )}
        </Link>
      }
      footer={
        <button
          type="button"
          onClick={() => {
            clear();
            window.location.href = '/login';
          }}
          className="flex w-full items-center gap-3 rounded-button px-3 py-2 text-sm text-blue-200 hover:bg-blue-800 hover:text-amber-300 transition-colors"
          title={collapsed ? 'Đăng xuất' : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      }
    />
  );
}
