'use client';

import { Badge, Card, CardContent, DataTable, type ColumnDef } from '@lms/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Ban, CheckCircle2, TrendingUp, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { RevokeCertificateModal } from '@/components/admin/revoke-certificate-modal';
import { adminCertificatesApi, type CertificateRow } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Đang hiệu lực', value: 'ACTIVE' },
  { label: 'Đã thu hồi', value: 'REVOKED' },
  { label: 'Hết hạn', value: 'EXPIRED' },
];

const STATUS_TONE: Record<string, 'info' | 'success' | 'warning' | 'error' | 'neutral'> = {
  ACTIVE: 'success',
  REVOKED: 'error',
  EXPIRED: 'warning',
};

export default function AdminCertificatesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [revoking, setRevoking] = useState<CertificateRow | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['admin-cert-summary'],
    queryFn: () => adminCertificatesApi.getStatsSummary(accessToken!),
    enabled: !!accessToken,
  });

  const listQuery = useQuery({
    queryKey: ['admin-certificates', { search, status, pageIndex }],
    queryFn: () =>
      adminCertificatesApi.list(
        {
          q: search || undefined,
          status: status || undefined,
          page: pageIndex + 1,
          limit: PAGE_SIZE,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-certificates'] });
    qc.invalidateQueries({ queryKey: ['admin-cert-summary'] });
  };

  const columns = useMemo<ColumnDef<CertificateRow, unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Mã chứng chỉ',
        cell: ({ row }) => (
          <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold">
            {row.original.code}
          </code>
        ),
      },
      {
        id: 'student',
        header: 'Học viên',
        cell: ({ row }) => (
          <div>
            <div className="text-sm font-medium text-foreground">{row.original.student.name}</div>
            <div className="text-xs text-muted">{row.original.student.email}</div>
          </div>
        ),
      },
      {
        id: 'course',
        header: 'Khoá học',
        cell: ({ row }) => (
          <span className="text-sm text-foreground">{row.original.course.title}</span>
        ),
      },
      {
        id: 'issuedAt',
        header: 'Ngày cấp',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {new Date(row.original.issuedAt).toLocaleDateString('vi-VN')}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => (
          <Badge tone={STATUS_TONE[row.original.status] ?? 'neutral'}>{row.original.status}</Badge>
        ),
      },
    ],
    [],
  );

  const rowActions = (cert: CertificateRow) => {
    if (cert.status === 'REVOKED') {
      return (
        <span className="text-xs italic text-muted" title={cert.revokedReason ?? undefined}>
          Đã thu hồi
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setRevoking(cert)}
        className="inline-flex items-center gap-1 rounded-button bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
      >
        <Ban className="h-3.5 w-3.5" />
        Thu hồi
      </button>
    );
  };

  const totalPages = listQuery.data?.totalPages ?? 1;
  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Quản lý chứng chỉ</h1>
        <p className="mt-1 text-sm text-muted">
          Xem, lọc và thu hồi chứng chỉ đã cấp cho học viên.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Award className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted">Tổng</p>
                <p className="text-2xl font-bold text-foreground">{summary?.total ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted">Đang hiệu lực</p>
                <p className="text-2xl font-bold text-foreground">{summary?.active ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted">Đã thu hồi</p>
                <p className="text-2xl font-bold text-foreground">{summary?.revoked ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted">Tỷ lệ đạt TB</p>
                <p className="text-2xl font-bold text-foreground">{summary?.avgPassRate ?? 0}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPageIndex(0);
            setSearch(e.target.value);
          }}
          placeholder="Tìm mã chứng chỉ, tên học viên, khoá học…"
          className="h-10 w-full rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 sm:max-w-md"
        />
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value || 'all'}
              type="button"
              onClick={() => {
                setPageIndex(0);
                setStatus(s.value);
              }}
              className={
                'whitespace-nowrap rounded-button px-3 py-1.5 text-xs font-semibold transition-colors ' +
                (status === s.value
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-muted hover:bg-surface-2/80')
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        data={listQuery.data?.data ?? []}
        columns={columns}
        manualPagination
        pageCount={totalPages}
        pageIndex={pageIndex}
        onPaginationChange={(s) => setPageIndex(s.pageIndex)}
        loading={listQuery.isLoading}
        rowActions={rowActions}
        emptyState={
          listQuery.isError
            ? (listQuery.error as Error).message
            : 'Không có chứng chỉ nào khớp bộ lọc.'
        }
      />

      <RevokeCertificateModal
        open={!!revoking}
        onClose={() => setRevoking(null)}
        certificate={revoking}
        onSuccess={invalidate}
      />
    </div>
  );
}
