'use client';

import {
  Badge,
  DataTable,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ColumnDef,
} from '@lms/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ContentDeleteModal } from '@/components/admin/content-delete-modal';
import { ContentRejectModal } from '@/components/admin/content-reject-modal';
import { adminContentApi, ApiError, type AdminCourseRow } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const PAGE_SIZE = 20;

type TabValue = 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED' | 'ALL';

const TAB_CONFIG: Record<TabValue, { label: string; status?: string }> = {
  PENDING_REVIEW: { label: 'Chờ duyệt', status: 'PENDING_REVIEW' },
  PUBLISHED: { label: 'Đã xuất bản', status: 'PUBLISHED' },
  ARCHIVED: { label: 'Lưu trữ', status: 'ARCHIVED' },
  ALL: { label: 'Tất cả' }, // no status filter
};

const STATUS_BADGE_TONE: Record<string, 'info' | 'success' | 'warning' | 'error' | 'neutral'> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

export default function AdminContentPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabValue>('PENDING_REVIEW');
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [rejecting, setRejecting] = useState<AdminCourseRow | null>(null);
  const [deleting, setDeleting] = useState<AdminCourseRow | null>(null);

  const query = useQuery({
    queryKey: ['admin-content-courses', { tab, pageIndex, search }],
    queryFn: () =>
      adminContentApi.listCourses(
        {
          q: search || undefined,
          status: TAB_CONFIG[tab].status,
          page: pageIndex + 1,
          limit: PAGE_SIZE,
        },
        accessToken!,
      ),
    enabled: !!accessToken,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-content-courses'] });

  const handleApprove = async (course: AdminCourseRow) => {
    if (!confirm(`Duyệt và xuất bản "${course.title}"?`)) return;
    try {
      await adminContentApi.approve(course.id, accessToken!);
      toast.success(`Đã duyệt "${course.title}"`);
      invalidate();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Duyệt thất bại';
      toast.error(msg);
    }
  };

  const columns = useMemo<ColumnDef<AdminCourseRow, unknown>[]>(
    () => [
      {
        id: 'course',
        header: 'Khoá học',
        cell: ({ row }) => (
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-surface-2">
              {row.original.thumbnailUrl && (
                // Thumbnails are MinIO URLs — img tag is fine without next/image
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.original.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{row.original.title}</div>
              <div className="truncate text-xs text-muted">
                {row.original.subject.name} · {row.original.subject.department.name}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'instructor',
        header: 'Giảng viên',
        cell: ({ row }) => (
          <div>
            <div className="text-sm text-foreground">{row.original.instructor.name}</div>
            <div className="text-xs text-muted">{row.original.instructor.email}</div>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => (
          <Badge tone={STATUS_BADGE_TONE[row.original.status] ?? 'neutral'}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'counts',
        header: 'Chương / HV',
        cell: ({ row }) => (
          <span className="text-xs text-muted">
            {row.original._count.chapters} chương · {row.original._count.enrollments} HV
          </span>
        ),
      },
      {
        id: 'createdAt',
        header: 'Ngày tạo',
        cell: ({ row }) => (
          <span className="text-xs text-muted">
            {new Date(row.original.createdAt).toLocaleDateString('vi-VN')}
          </span>
        ),
      },
    ],
    [],
  );

  const rowActions = (course: AdminCourseRow) => (
    <div className="flex items-center justify-end gap-1">
      {course.status === 'PENDING_REVIEW' && (
        <>
          <button
            type="button"
            onClick={() => handleApprove(course)}
            className="inline-flex items-center gap-1 rounded-button bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40 transition-colors"
            title="Duyệt"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Duyệt
          </button>
          <button
            type="button"
            onClick={() => setRejecting(course)}
            className="inline-flex items-center gap-1 rounded-button bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 transition-colors"
            title="Từ chối"
          >
            <XCircle className="h-3.5 w-3.5" />
            Từ chối
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => setDeleting(course)}
        className="inline-flex items-center gap-1 rounded-button bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 transition-colors"
        title="Xoá"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Quản lý nội dung</h1>
        <p className="mt-1 text-sm text-muted">
          Duyệt, từ chối hoặc xoá khoá học do giảng viên tạo. Mọi thao tác được ghi Audit Log.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as TabValue);
          setPageIndex(0);
        }}
      >
        <TabsList>
          {(Object.keys(TAB_CONFIG) as TabValue[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {TAB_CONFIG[key].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(TAB_CONFIG) as TabValue[]).map((key) => (
          <TabsContent key={key} value={key}>
            <div className="my-4">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setPageIndex(0);
                  setSearch(e.target.value);
                }}
                placeholder="Tìm tên khoá học…"
                className="h-10 w-full max-w-sm rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
              />
            </div>

            <DataTable
              data={query.data?.data ?? []}
              columns={columns}
              manualPagination
              pageCount={totalPages}
              pageIndex={pageIndex}
              onPaginationChange={(s) => setPageIndex(s.pageIndex)}
              loading={query.isLoading}
              rowActions={rowActions}
              emptyState={
                query.isError
                  ? (query.error as Error).message
                  : tab === 'PENDING_REVIEW'
                    ? 'Không có khoá học nào chờ duyệt.'
                    : 'Không có khoá học nào.'
              }
            />
          </TabsContent>
        ))}
      </Tabs>

      <ContentRejectModal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        course={rejecting}
        onSuccess={invalidate}
      />
      <ContentDeleteModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        course={deleting}
        onSuccess={invalidate}
      />
    </div>
  );
}
