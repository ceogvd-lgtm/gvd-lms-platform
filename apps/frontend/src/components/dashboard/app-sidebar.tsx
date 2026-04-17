'use client';

import { Sidebar, type SidebarItem } from '@lms/ui';
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  Home,
  LayoutGrid,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { GvdLogo } from '@/components/brand/gvd-logo';
import { useAuthStore } from '@/lib/auth-store';

interface AppSidebarProps {
  collapsed?: boolean;
}

export function AppSidebar({ collapsed = false }: AppSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const role = user?.role;

  const items: SidebarItem[] = useMemo(() => {
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
    // Phase 14 wires up the student routes. "Tổng quan" points at the
    // new /student/dashboard for STUDENT + routes back to the shared
    // /dashboard demo for other roles so admin/instructor visuals stay
    // unchanged. "Lộ trình" and "Tiến độ" are student-only — they
    // degrade to "Sắp có" for non-students so the same sidebar works
    // everywhere. Cài đặt stays as "Sắp có" (Phase 15+).
    const isStudent = role === 'STUDENT';
    const base: SidebarItem[] = [
      {
        label: 'Tổng quan',
        href: isStudent ? '/student/dashboard' : '/dashboard',
        icon: Home,
        active: isStudent ? isActive('/student/dashboard') : isActive('/dashboard'),
      },
      {
        label: 'Khoá học',
        // STUDENT: show enrolled courses via dashboard card "Khoá học" block.
        // Others: Sắp có (courses catalog page for public browsing — Phase 15+).
        ...(isStudent
          ? {
              href: '/student/my-learning',
              icon: BookOpen,
              active: isActive('/student/my-learning'),
            }
          : { icon: BookOpen, disabled: true, disabledReason: 'Sắp có' }),
      },
      {
        label: 'Bài giảng',
        // Per-lesson deeplinks require an id. Leave as "Sắp có" everywhere —
        // the "Khoá học" entry above is the way into the lesson viewer.
        icon: GraduationCap,
        disabled: true,
        disabledReason: 'Sắp có',
      },
      {
        label: 'Tiến độ',
        ...(isStudent
          ? { href: '/student/progress', icon: BarChart3, active: isActive('/student/progress') }
          : { icon: BarChart3, disabled: true, disabledReason: 'Sắp có' }),
      },
    ];

    if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
      base.push({
        label: 'Quản trị',
        icon: ShieldCheck,
        active: pathname.startsWith('/admin'),
        children: [
          {
            label: 'Người dùng',
            href: '/admin/users',
            icon: Users,
            active: isActive('/admin/users'),
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
            icon: LayoutGrid,
            active: isActive('/admin/audit-log'),
          },
        ],
      });
    }

    base.push({
      label: 'Cài đặt',
      icon: Settings,
      disabled: true,
      disabledReason: 'Sắp có',
    });

    return base;
  }, [pathname, role]);

  return (
    <Sidebar
      collapsed={collapsed}
      items={items}
      brand={
        <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-primary">
          <span className="flex h-10 w-10 items-center justify-center rounded-button bg-primary text-primary-foreground">
            <GvdLogo className="h-7 w-7" />
          </span>
          {!collapsed && (
            <span className="text-base">
              GVD <span className="text-secondary">next-gen</span>
            </span>
          )}
        </Link>
      }
      footer={
        <button
          type="button"
          onClick={() => {
            clear();
            // Hard redirect rather than router.push so any cached
            // authenticated page state is dropped at the same time.
            window.location.href = '/login';
          }}
          className="flex w-full items-center gap-3 rounded-button px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-error transition-colors"
          title={collapsed ? 'Đăng xuất' : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      }
    />
  );
}
