'use client';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@lms/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Bell,
  BookOpen,
  CheckCheck,
  GraduationCap,
  type LucideIcon,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import {
  type AppNotification,
  connectNotificationsSocket,
  disconnectNotificationsSocket,
  notificationsApi,
  notificationTypeLabel,
} from '@/lib/notifications';

/**
 * Header notification bell.
 *
 * - Badge shows live unread count (hydrated from REST on mount + updated by
 *   Socket.io `unreadCount` event and optimistic local state)
 * - Dropdown panel lists newest 20 notifications with infinite-load-more
 * - Real-time: Socket.io connects on mount with the current JWT; prepends
 *   incoming notifications without a full refetch
 * - Click a notification → marks it read, navigates to `data.url` if present
 * - "Đánh dấu tất cả đã đọc" button at panel footer
 */
export function NotificationBell() {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  // --- Local feed state (seeded from REST, then grown by socket + scroll) ---
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // --- Initial unread count (fast path) ---
  const unreadQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationsApi.unreadCount(token!),
    enabled: !!token,
    refetchInterval: 30_000, // fallback if socket is down
  });
  useEffect(() => {
    if (typeof unreadQuery.data?.count === 'number') {
      setUnreadCount(unreadQuery.data.count);
    }
  }, [unreadQuery.data]);

  // --- Initial list (first page) ---
  const listQuery = useQuery({
    queryKey: ['notifications-list', 1],
    queryFn: () => notificationsApi.list({ page: 1, limit: 20 }, token!),
    enabled: !!token,
  });
  useEffect(() => {
    if (listQuery.data) {
      setItems(listQuery.data.data);
      setPage(1);
      setHasMore(listQuery.data.totalPages > 1);
    }
  }, [listQuery.data]);

  // --- Socket.io real-time ---
  useEffect(() => {
    if (!token) return;
    const socket = connectNotificationsSocket(token);
    const onNew = (n: AppNotification) => {
      setItems((prev) => [n, ...prev]);
      setUnreadCount((c) => c + 1);
    };
    const onUnreadCount = (n: number) => setUnreadCount(n);
    socket.on('notification', onNew);
    socket.on('unreadCount', onUnreadCount);
    return () => {
      socket.off('notification', onNew);
      socket.off('unreadCount', onUnreadCount);
    };
  }, [token]);

  // --- Cleanup socket on unmount (e.g. full logout) ---
  useEffect(() => {
    return () => {
      if (!token) disconnectNotificationsSocket();
    };
  }, [token]);

  const loadMore = useCallback(async () => {
    if (!token || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await notificationsApi.list({ page: next, limit: 20 }, token);
      setItems((prev) => [...prev, ...res.data]);
      setPage(next);
      setHasMore(next < res.totalPages);
    } finally {
      setLoadingMore(false);
    }
  }, [token, page, hasMore, loadingMore]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      if (!token) return;
      // Optimistic
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationsApi.markRead(id, token);
      } catch {
        // Revert (simple approach — refetch)
        queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
        queryClient.invalidateQueries({
          queryKey: ['notifications-unread-count'],
        });
      }
    },
    [token, queryClient],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!token) return;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationsApi.markAllRead(token);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
      queryClient.invalidateQueries({
        queryKey: ['notifications-unread-count'],
      });
    }
  }, [token, queryClient]);

  // --- Infinite scroll sentinel ---
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '100px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  const displayCount = useMemo(
    () => (unreadCount > 99 ? '99+' : String(unreadCount)),
    [unreadCount],
  );

  if (!token) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Thông báo"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-button text-muted hover:bg-surface-2 hover:text-foreground transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white ring-2 ring-surface">
              {displayCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            Thông báo
            {unreadCount > 0 && (
              <span className="ml-2 text-xs font-normal text-muted">· {unreadCount} chưa đọc</span>
            )}
          </p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-700"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Đánh dấu tất cả
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[480px] overflow-y-auto">
          {listQuery.isLoading && items.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted">Đang tải…</div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <NotificationRow key={n.id} item={n} onMarkRead={() => handleMarkRead(n.id)} />
              ))}
              {hasMore && (
                <li ref={sentinelRef} className="px-4 py-4 text-center text-xs text-muted">
                  {loadingMore ? 'Đang tải thêm…' : 'Cuộn để tải tiếp'}
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 text-center">
          <Link
            href="/notifications"
            className="text-xs font-medium text-primary hover:text-primary-700"
          >
            Xem tất cả thông báo
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =========================================================
// NotificationRow
// =========================================================

const ICON_FOR_TYPE: Record<string, LucideIcon> = {
  COURSE_ENROLLED: BookOpen,
  LESSON_COMPLETED: GraduationCap,
  CERTIFICATE_ISSUED: Award,
  QUIZ_GRADED: Sparkles,
  INSTRUCTOR_FEEDBACK: MessageSquare,
  SYSTEM_ALERT: ShieldAlert,
};

function NotificationRow({ item, onMarkRead }: { item: AppNotification; onMarkRead: () => void }) {
  const Icon = ICON_FOR_TYPE[item.type] ?? Bell;
  const href =
    item.data && typeof item.data === 'object' && 'url' in item.data
      ? String((item.data as { url: unknown }).url)
      : '#';

  const handleClick = () => {
    if (!item.isRead) onMarkRead();
  };

  return (
    <li>
      <Link
        href={href}
        onClick={handleClick}
        className={
          'flex gap-3 px-4 py-3 transition-colors ' +
          (item.isRead ? 'bg-surface hover:bg-surface-2' : 'bg-primary/5 hover:bg-primary/10')
        }
      >
        <div
          className={
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' +
            (item.isRead ? 'bg-surface-2 text-muted' : 'bg-primary/10 text-primary')
          }
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={
                'text-sm truncate ' +
                (item.isRead ? 'text-foreground' : 'font-semibold text-foreground')
              }
            >
              {item.title}
            </p>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">
              {notificationTypeLabel(item.type)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted line-clamp-2">{item.message}</p>
          <p className="mt-1 text-[11px] text-muted">{formatRelative(item.createdAt)}</p>
        </div>
        {!item.isRead && (
          <span aria-label="unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
      </Link>
    </li>
  );
}

// =========================================================
// Empty state
// =========================================================

/** Simple Vietnamese relative time formatter (no date-fns dep). */
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks} tuần trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}

function EmptyState() {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Bell className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-foreground">Không có thông báo mới</p>
      <p className="mt-1 text-xs text-muted">Khi có hoạt động mới, bạn sẽ thấy ở đây.</p>
    </div>
  );
}
