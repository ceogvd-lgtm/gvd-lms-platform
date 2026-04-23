'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@lms/ui';
import { AlertTriangle, Clock, UserX } from 'lucide-react';
import Link from 'next/link';

import type { AlertsResponse } from '@/lib/api';

interface AlertsPanelProps {
  data?: AlertsResponse;
  loading?: boolean;
}

export function AlertsPanel({ data, loading }: AlertsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Cảnh báo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-card bg-surface-2" />
            <div className="h-16 animate-pulse rounded-card bg-surface-2" />
          </div>
        ) : (
          <>
            {/* Inactive students */}
            <Link
              href="/admin/users?status=active"
              className="flex items-center justify-between rounded-card border border-border bg-surface-2/40 p-3 transition-colors hover:border-amber-500/40 hover:bg-amber-500/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                  <UserX className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Học viên chưa đăng nhập 7 ngày
                  </p>
                  <p className="text-xs text-muted">Cần gửi nhắc học</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {data?.inactiveStudents ?? 0}
              </span>
            </Link>

            {/* Pending courses */}
            <Link
              href="/admin/content"
              className="flex items-center justify-between rounded-card border border-border bg-surface-2/40 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Khoá học chờ duyệt</p>
                  <p className="text-xs text-muted">Cần admin phê duyệt</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-primary">{data?.pendingCourses ?? 0}</span>
            </Link>

            {/* Pending items list — top 5 */}
            {data && data.pendingItems.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Khoá học mới nhất cần duyệt
                </p>
                <ul className="max-h-[240px] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                  {data.pendingItems.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{item.title}</p>
                        <p className="truncate text-muted">GV: {item.instructorName}</p>
                      </div>
                      <span className="shrink-0 text-muted">
                        {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
