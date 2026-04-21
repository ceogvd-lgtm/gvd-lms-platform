'use client';

/**
 * Phase 18 hotfix — trang /notifications trước đây không tồn tại, nút
 * "Xem tất cả thông báo" trong NotificationBell trỏ tới đây ra 404.
 *
 * Trang hiển thị danh sách thông báo đầy đủ với pagination + filter, gộp
 * chung trong `(dashboard)` group để mọi role (Admin/Instructor/Student)
 * đều dùng được — giống /profile và /account/settings.
 */
import { Button } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Bell,
  BookOpen,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  type LucideIcon,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/auth-store';
import { type AppNotification, notificationsApi, notificationTypeLabel } from '@/lib/notifications';

const PAGE_SIZE = 20;

const ICON_FOR_TYPE: Record<string, LucideIcon> = {
  COURSE_ENROLLED: BookOpen,
  LESSON_COMPLETED: GraduationCap,
  CERTIFICATE_ISSUED: Award,
  QUIZ_GRADED: Sparkles,
  INSTRUCTOR_FEEDBACK: MessageSquare,
  SYSTEM_ALERT: ShieldAlert,
};

type Filter = 'all' | 'unread';

export default function NotificationsPage() {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>('all');

  const listQuery = useQuery({
    queryKey: ['notifications', 'page', page, filter],
    queryFn: () =>
      notificationsApi.list({ page, limit: PAGE_SIZE, unreadOnly: filter === 'unread' }, token!),
    enabled: !!token,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id, token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(token!),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(`Đã đánh dấu ${res.count} thông báo đã đọc`);
    },
    onError: () => toast.error('Không đánh dấu được — vui lòng thử lại'),
  });

  // Reset to page 1 when filter changes
  const handleFilterChange = (next: Filter) => {
    if (next === filter) return;
    setFilter(next);
    setPage(1);
  };

  const data = listQuery.data;
  const items = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-card bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Thông báo</h1>
            <p className="text-sm text-muted">
              {total > 0 ? `${total} thông báo` : 'Tất cả thông báo gửi đến bạn'}
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs + mark-all */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="inline-flex rounded-button bg-surface p-1">
          <button
            type="button"
            onClick={() => handleFilterChange('all')}
            className={
              'rounded-button px-4 py-1.5 text-sm font-medium transition-colors ' +
              (filter === 'all' ? 'bg-primary text-white' : 'text-muted hover:text-foreground')
            }
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('unread')}
            className={
              'rounded-button px-4 py-1.5 text-sm font-medium transition-colors ' +
              (filter === 'unread' ? 'bg-primary text-white' : 'text-muted hover:text-foreground')
            }
          >
            Chưa đọc
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending || items.every((n) => n.isRead)}
          className="gap-2"
        >
          <CheckCheck className="h-4 w-4" />
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      {/* Content */}
      {listQuery.isLoading ? (
        <LoadingState />
      ) : listQuery.isError ? (
        <ErrorState onRetry={() => listQuery.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {items.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                onMarkRead={() => {
                  if (!n.isRead) markReadMutation.mutate(n.id);
                }}
              />
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-muted">
                Trang {page} / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || listQuery.isFetching}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || listQuery.isFetching}
                  className="gap-1"
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =========================================================
// NotificationRow — giống NotificationBell nhưng hiển thị full, không truncate
// =========================================================
function NotificationRow({ item, onMarkRead }: { item: AppNotification; onMarkRead: () => void }) {
  const Icon = ICON_FOR_TYPE[item.type] ?? Bell;
  const href =
    item.data && typeof item.data === 'object' && 'url' in item.data
      ? String((item.data as { url: unknown }).url)
      : null;

  const body = (
    <div
      className={
        'flex gap-3 px-4 py-4 transition-colors ' +
        (item.isRead ? 'bg-surface hover:bg-surface-2' : 'bg-primary/5 hover:bg-primary/10')
      }
    >
      <div
        className={
          'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
          (item.isRead ? 'bg-surface-2 text-muted' : 'bg-primary/10 text-primary')
        }
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={
              'text-sm ' + (item.isRead ? 'text-foreground' : 'font-semibold text-foreground')
            }
          >
            {item.title}
          </p>
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">
            {notificationTypeLabel(item.type)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{item.message}</p>
        <p className="mt-2 text-[11px] text-muted">{formatRelative(item.createdAt)}</p>
      </div>
      {!item.isRead && (
        <span aria-label="unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </div>
  );

  return (
    <li>
      {href ? (
        <Link href={href} onClick={onMarkRead} className="block">
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onMarkRead} className="block w-full text-left">
          {body}
        </button>
      )}
    </li>
  );
}

// =========================================================
// States
// =========================================================
function LoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-card border border-border bg-surface px-4 py-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-card border border-border bg-surface px-6 py-12 text-center">
      <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-foreground">Không tải được thông báo</p>
      <p className="mt-1 text-xs text-muted">Vui lòng kiểm tra kết nối và thử lại.</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <div className="rounded-card border border-border bg-surface px-6 py-12 text-center">
      <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Bell className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {filter === 'unread' ? 'Bạn đã đọc hết rồi!' : 'Không có thông báo nào'}
      </p>
      <p className="mt-1 text-xs text-muted">
        {filter === 'unread'
          ? 'Không có thông báo chưa đọc.'
          : 'Khi có hoạt động mới, bạn sẽ thấy ở đây.'}
      </p>
    </div>
  );
}

// =========================================================
// Helpers
// =========================================================
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
