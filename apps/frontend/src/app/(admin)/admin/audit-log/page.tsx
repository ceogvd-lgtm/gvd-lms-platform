'use client';

import { DataTable, type ColumnDef } from '@lms/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { AuditDetailModal } from '@/components/admin/audit-detail-modal';
import { RoleBadge } from '@/components/ui/role-badge';
import { adminApi, type AuditLogEntry } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { Role } from '@/lib/rbac';

const ACTION_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Tạo Admin', value: 'ADMIN_CREATE_ADMIN' },
  { label: 'Xoá User', value: 'ADMIN_DELETE_USER' },
  { label: 'Đổi Role', value: 'ADMIN_UPDATE_ROLE' },
  { label: 'Khoá User', value: 'ADMIN_BLOCK_USER' },
  { label: 'Mở khoá', value: 'ADMIN_UNBLOCK_USER' },
  { label: 'Duyệt nội dung', value: 'CONTENT_APPROVE' },
  { label: 'Từ chối nội dung', value: 'CONTENT_REJECT' },
  { label: 'Xoá khoá học', value: 'CONTENT_DELETE' },
  { label: 'Xoá bài giảng', value: 'LESSON_DELETE' },
  { label: 'Thu hồi chứng chỉ', value: 'CERTIFICATE_REVOKE' },
  { label: 'Đổi cài đặt', value: 'SYSTEM_SETTING_UPDATE' },
];

const TARGET_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Tất cả', value: '' },
  { label: 'User', value: 'User' },
  { label: 'Course', value: 'Course' },
  { label: 'Lesson', value: 'Lesson' },
  { label: 'Certificate', value: 'Certificate' },
  { label: 'SystemSetting', value: 'SystemSetting' },
];

const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const query = useQuery({
    queryKey: ['audit-log', { search, action, targetType, pageIndex }],
    queryFn: () =>
      adminApi.listAuditLog(
        {
          q: search || undefined,
          action: action || undefined,
          targetType: targetType || undefined,
          page: pageIndex + 1,
          limit: PAGE_SIZE,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<AuditLogEntry, unknown>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'Thời gian',
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-xs text-muted">
            {new Date(row.original.createdAt).toLocaleString('vi-VN')}
          </span>
        ),
      },
      {
        id: 'user',
        header: 'Người thực hiện',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <RoleBadge role={row.original.user.role as Role} />
            <span className="text-xs text-foreground">{row.original.user.name}</span>
          </div>
        ),
      },
      {
        id: 'action',
        header: 'Hành động',
        cell: ({ row }) => (
          <code className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-primary">
            {row.original.action}
          </code>
        ),
      },
      {
        id: 'target',
        header: 'Target',
        cell: ({ row }) => (
          <div className="text-xs">
            <span className="font-semibold text-foreground">{row.original.targetType}</span>
            {' · '}
            <span className="font-mono text-muted">{row.original.targetId.slice(0, 10)}…</span>
          </div>
        ),
      },
      {
        id: 'ip',
        header: 'IP',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted">{row.original.ipAddress}</span>
        ),
      },
    ],
    [],
  );

  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
        <p className="mt-1 text-sm text-muted">
          Lịch sử toàn bộ hành động admin — không thể chỉnh sửa. Bấm vào dòng để xem chi tiết diff
          oldValue/newValue.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPageIndex(0);
            setSearch(e.target.value);
          }}
          placeholder="Tìm theo action (ví dụ: DELETE)…"
          className="h-10 w-full max-w-sm rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />

        <div className="flex flex-wrap gap-2">
          <span className="flex items-center text-xs font-semibold uppercase text-muted">
            Action:
          </span>
          {ACTION_FILTERS.map((f) => (
            <button
              key={f.value || 'all-a'}
              type="button"
              onClick={() => {
                setPageIndex(0);
                setAction(f.value);
              }}
              className={
                'rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (action === f.value
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-muted hover:bg-surface-2/80')
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="flex items-center text-xs font-semibold uppercase text-muted">
            Target:
          </span>
          {TARGET_FILTERS.map((f) => (
            <button
              key={f.value || 'all-t'}
              type="button"
              onClick={() => {
                setPageIndex(0);
                setTargetType(f.value);
              }}
              className={
                'rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (targetType === f.value
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-muted hover:bg-surface-2/80')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        data={query.data?.data ?? []}
        columns={columns}
        manualPagination
        pageCount={totalPages}
        pageIndex={pageIndex}
        onPaginationChange={(s) => setPageIndex(s.pageIndex)}
        loading={query.isLoading}
        rowActions={(row) => (
          <button
            type="button"
            onClick={() => setSelectedEntry(row)}
            className="rounded-button border border-border px-2.5 py-1 text-xs font-semibold text-muted hover:border-primary hover:text-primary transition-colors"
          >
            Chi tiết
          </button>
        )}
        emptyState={
          query.isError ? (query.error as Error).message : 'Chưa có bản ghi audit log nào.'
        }
      />

      <AuditDetailModal
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        entry={selectedEntry}
      />
    </div>
  );
}
