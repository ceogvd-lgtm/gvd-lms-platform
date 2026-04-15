'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { RoleBadge } from '@/components/ui/role-badge';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { Role } from '@/lib/rbac';

const ACTION_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Tạo Admin', value: 'ADMIN_CREATE_ADMIN' },
  { label: 'Xoá User', value: 'ADMIN_DELETE_USER' },
  { label: 'Đổi Role', value: 'ADMIN_UPDATE_ROLE' },
  { label: 'Khoá User', value: 'ADMIN_BLOCK_USER' },
  { label: 'Mở khoá', value: 'ADMIN_UNBLOCK_USER' },
  { label: 'Xoá Lesson', value: 'LESSON_DELETE' },
];

const TARGET_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Tất cả', value: '' },
  { label: 'User', value: 'User' },
  { label: 'Lesson', value: 'Lesson' },
];

export default function AuditLogPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['audit-log', { search, action, targetType, page }],
    queryFn: () =>
      adminApi.listAuditLog(
        {
          q: search || undefined,
          action: action || undefined,
          targetType: targetType || undefined,
          page,
          limit: 20,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Lịch sử toàn bộ hành động admin / xoá bài giảng — không thể chỉnh sửa.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Tìm theo action (ví dụ: DELETE)…"
            className="h-10 w-full rounded-button border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary-100 dark:border-slate-700 dark:bg-dark-surface dark:focus:ring-primary-900/40"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold uppercase text-slate-400">Action:</span>
          {ACTION_FILTERS.map((f) => (
            <button
              key={f.value || 'all-a'}
              type="button"
              onClick={() => {
                setPage(1);
                setAction(f.value);
              }}
              className={
                'rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (action === f.value
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700')
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold uppercase text-slate-400">Target:</span>
          {TARGET_FILTERS.map((f) => (
            <button
              key={f.value || 'all-t'}
              type="button"
              onClick={() => {
                setPage(1);
                setTargetType(f.value);
              }}
              className={
                'rounded-button px-2.5 py-1 text-xs font-semibold transition-colors ' +
                (targetType === f.value
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-card border border-slate-200 bg-white dark:border-slate-700 dark:bg-dark-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Thời gian</th>
              <th className="px-4 py-3">Người thực hiện</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {query.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Đang tải…
                </td>
              </tr>
            )}
            {query.isError && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-red-500">
                  {(query.error as Error).message}
                </td>
              </tr>
            )}
            {query.data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  Chưa có bản ghi nào.
                </td>
              </tr>
            )}
            {query.data?.data.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                  {new Date(log.createdAt).toLocaleString('vi-VN')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <RoleBadge role={log.user.role as Role} />
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {log.user.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-primary dark:bg-slate-800">
                    {log.action}
                  </code>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {log.targetType}
                  </span>
                  {' · '}
                  <span className="font-mono">{log.targetId.slice(0, 8)}…</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.ipAddress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {query.data && query.data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Trang {query.data.page} / {query.data.totalPages} · Tổng {query.data.total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-button border border-slate-200 px-3 py-1.5 disabled:opacity-50 dark:border-slate-700"
            >
              Trước
            </button>
            <button
              disabled={page >= (query.data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-button border border-slate-200 px-3 py-1.5 disabled:opacity-50 dark:border-slate-700"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </>
  );
}
