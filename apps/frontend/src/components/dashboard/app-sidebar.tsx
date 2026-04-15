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
  const role = user?.role;

  const items: SidebarItem[] = useMemo(() => {
    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
    const base: SidebarItem[] = [
      {
        label: 'Tổng quan',
        href: '/dashboard',
        icon: Home,
        active: isActive('/dashboard'),
      },
      {
        label: 'Khoá học',
        href: '/courses',
        icon: BookOpen,
        active: isActive('/courses'),
      },
      {
        label: 'Bài giảng',
        href: '/lessons',
        icon: GraduationCap,
        active: isActive('/lessons'),
      },
      {
        label: 'Tiến độ',
        href: '/progress',
        icon: BarChart3,
        active: isActive('/progress'),
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
      href: '/settings',
      icon: Settings,
      active: isActive('/settings'),
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
