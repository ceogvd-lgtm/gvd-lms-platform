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

import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuthStore } from '@/lib/auth-store';

interface AppHeaderProps {
  onToggleSidebar?: () => void;
}

export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

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
              Profile + Settings pages aren't implemented yet (Phase 14 scope).
              Render them `disabled` with a "Sắp có" hint so the affordance is
              still discoverable without letting the user click into an empty
              route. The wrapping <span title> is there because Radix's
              disabled DropdownMenuItem applies `pointer-events: none`, which
              silently eats hover events — the span catches the hover and the
              browser shows its native tooltip on top.
            */}
            <span title="Sắp có — tính năng Phase 14">
              <DropdownMenuItem disabled>
                <UserIcon className="h-4 w-4" />
                Hồ sơ
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">
                  Sắp có
                </span>
              </DropdownMenuItem>
            </span>
            <span title="Sắp có — tính năng Phase 14">
              <DropdownMenuItem disabled>
                <Settings className="h-4 w-4" />
                Cài đặt
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted">
                  Sắp có
                </span>
              </DropdownMenuItem>
            </span>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => clear()}>
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
