'use client';

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@lms/ui';
import { LogOut, Menu, Search, Settings, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuthStore } from '@/lib/auth-store';

interface AppHeaderProps {
  onToggleSidebar?: () => void;
}

export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((s) => s[0])
        .filter(Boolean)
        .slice(-2)
        .join('')
    : '??';

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-surface/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-button text-muted hover:bg-surface-2 hover:text-foreground transition-colors lg:hidden"
          aria-label="Mở menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Search bar */}
      <div className="hidden flex-1 max-w-md md:block">
        <Input
          type="search"
          placeholder="Tìm khoá học, bài giảng…"
          iconPrefix={Search}
          aria-label="Tìm kiếm"
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        {/* Notification bell — live via Socket.io */}
        <NotificationBell />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 inline-flex items-center gap-2 rounded-button p-1 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Tài khoản"
            >
              <Avatar size="sm" src={user?.avatar ?? undefined} initials={initials} online />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            {user && (
              <>
                <DropdownMenuLabel className="normal-case">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground">{user.name}</span>
                    <span className="text-xs text-muted">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            {/*
              Profile + Settings đã triển khai — bấm vào dẫn sang route tương
              ứng. Layout (dashboard) đã có auth guard nên không cần check
              lại ở đây.
            */}
            <DropdownMenuItem onSelect={() => router.push('/profile')}>
              <UserIcon className="h-4 w-4" />
              Hồ sơ
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/account/settings')}>
              <Settings className="h-4 w-4" />
              Cài đặt
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                clear();
                // Hard redirect drops any cached auth-protected page state
                // along with the Zustand reset — layouts without an auth
                // guard (e.g. /dashboard) would otherwise stay visible.
                window.location.href = '/login';
              }}
            >
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
