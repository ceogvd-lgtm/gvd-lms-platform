'use client';

import { Sidebar, type SidebarItem } from '@lms/ui';
import {
  Award,
  BarChart3,
  BookOpen,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { GvdLogo } from '@/components/brand/gvd-logo';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Admin sidebar with role-gated menu (Phase 09).
 *
 * The "Cài đặt hệ thống" item is only visible for SUPER_ADMIN — ADMIN
 * sees the rest of the menu but cannot reach `/admin/settings` from the
 * sidebar. If an ADMIN hits the URL directly, the page itself renders
 * a read-only view with disabled inputs (defense-in-depth).
 */
interface AdminSidebarProps {
  collapsed?: boolean;
}

export function AdminSidebar({ collapsed = false }: AdminSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const role = user?.role;

  const items: SidebarItem[] = useMemo(() => {
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

    const base: SidebarItem[] = [
      {
        label: 'Tổng quan',
        href: '/admin/dashboard',
        icon: LayoutDashboard,
        active: isActive('/admin/dashboard'),
      },
      {
        label: 'Người dùng',
        href: '/admin/users',
        icon: Users,
        active: isActive('/admin/users'),
      },
      {
        label: 'Nội dung',
        href: '/admin/content',
        icon: FileText,
        active: isActive('/admin/content'),
      },
      {
        // Phase 18 — admin-scoped question bank view (xem toàn bộ, xoá hàng loạt).
        // /instructor/questions vẫn còn & không bị ảnh hưởng.
        label: 'Ngân hàng câu hỏi',
        href: '/admin/questions',
        icon: BookOpen,
        active: isActive('/admin/questions'),
      },
      {
        label: 'Chứng chỉ',
        href: '/admin/certificates',
        icon: Award,
        active: isActive('/admin/certificates'),
      },
      {
        label: 'Báo cáo',
        href: '/admin/reports',
        icon: BarChart3,
        active: isActive('/admin/reports'),
      },
      {
        label: 'Curriculum',
        href: '/admin/curriculum',
        icon: LayoutGrid,
        active: isActive('/admin/curriculum'),
      },
      {
        label: 'Audit Log',
        href: '/admin/audit-log',
        icon: ScrollText,
        active: isActive('/admin/audit-log'),
      },
    ];

    if (role === 'SUPER_ADMIN') {
      base.push({
        label: 'Cài đặt hệ thống',
        href: '/admin/settings',
        icon: Settings,
        active: isActive('/admin/settings'),
      });
    }

    return base;
  }, [pathname, role]);

  return (
    <Sidebar
      collapsed={collapsed}
      items={items}
      // Darker navy styling to distinguish from the learner dashboard sidebar,
      // per Phase 09 design spec.
      className="bg-slate-900 border-r-slate-800 text-slate-200"
      brand={
        <Link
          href="/admin/dashboard"
          className="flex min-w-0 items-center gap-2 font-bold text-white"
        >
          {/* White "dương bản" logo on the slate background — keeps the
              brand mark crisp against the dark surface instead of
              blending into the secondary-violet role accent. */}
          <GvdLogo className="h-8 w-8 shrink-0 text-white" />
          {!collapsed && (
            <span className="min-w-0 truncate text-sm leading-tight">
              GVD next gen LMS <span className="text-secondary-300">· Admin</span>
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
          className="flex w-full items-center gap-3 rounded-button px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
          title={collapsed ? 'Đăng xuất' : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      }
    />
  );
}
