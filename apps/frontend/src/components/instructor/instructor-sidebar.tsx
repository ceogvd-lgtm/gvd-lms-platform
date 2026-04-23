'use client';

import { Sidebar, type SidebarItem } from '@lms/ui';
import {
  BarChart3,
  BookOpen,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Plus,
} from 'lucide-react';
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
        label: 'Ngân hàng câu hỏi',
        href: '/instructor/questions',
        icon: HelpCircle,
        active: isActive('/instructor/questions'),
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
      // Consistent navy theme across Light + Dark — the previous Light
      // variant (`bg-blue-700`) washed out against the amber logo chip;
      // unifying on `bg-blue-950` gives the white brand text and the
      // role accent (amber) maximum contrast in both modes.
      className="bg-blue-950 border-r-blue-900 text-blue-50"
      brand={
        <Link
          href="/instructor/dashboard"
          className="flex min-w-0 items-center gap-2 font-bold text-white"
        >
          {/* White logo on the navy surface — "dương bản" (positive) ink
              gives the brand mark the highest possible contrast against
              the sidebar background, instead of competing with the amber
              role accent next to it. `shrink-0` keeps the mark square
              when the long label truncates. */}
          <GvdLogo className="h-8 w-8 shrink-0 text-white" />
          {!collapsed && (
            <span className="min-w-0 truncate text-sm leading-tight">
              GVD next gen LMS <span className="text-amber-300">· Giảng viên</span>
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
