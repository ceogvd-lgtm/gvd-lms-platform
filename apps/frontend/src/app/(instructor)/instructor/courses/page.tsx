'use client';

import { Badge, Button } from '@lms/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Edit, Eye, Grid3x3, List, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CourseCard } from '@/components/instructor/course-card';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { coursesApi, type Course, type CourseStatus } from '@/lib/curriculum';

type ViewMode = 'grid' | 'list';

const STATUS_FILTERS: Array<{ label: string; value: CourseStatus | '' }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Bản nháp', value: 'DRAFT' },
  { label: 'Chờ duyệt', value: 'PENDING_REVIEW' },
  { label: 'Đã xuất bản', value: 'PUBLISHED' },
  { label: 'Lưu trữ', value: 'ARCHIVED' },
];

const STATUS_TONE: Record<CourseStatus, 'info' | 'success' | 'warning' | 'neutral'> = {
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
};

export default function InstructorCoursesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CourseStatus | ''>('');

  const query = useQuery({
    queryKey: ['instructor-courses', { search, status, instructorId: me?.id }],
    queryFn: () =>
      coursesApi.list(
        {
          q: search || undefined,
          status: (status || undefined) as CourseStatus | undefined,
          instructorId: me?.id,
          page: 1,
          limit: 60, // client-side filter on a single page is fine
        },
        accessToken!,
      ),
    enabled: !!accessToken && !!me,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['instructor-courses'] });

  const handleArchive = async (course: Course) => {
    if (
      !confirm(
        `Lưu trữ "${course.title}"? Học viên đã đăng ký vẫn có thể truy cập đến khi bài học cuối hoàn thành.`,
      )
    ) {
      return;
    }
    try {
      await coursesApi.updateStatus(course.id, 'ARCHIVE', accessToken!);
      toast.success('Đã lưu trữ khoá học');
      invalidate();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Lưu trữ thất bại';
      toast.error(msg);
    }
  };

  const handleSubmitForReview = async (course: Course) => {
    if (
      !confirm(
        `Gửi khoá học "${course.title}" cho Admin duyệt? Sau khi gửi, bạn không chỉnh sửa cấu trúc được đến khi Admin phản hồi.`,
      )
    ) {
      return;
    }
    try {
      await coursesApi.updateStatus(course.id, 'SUBMIT', accessToken!);
      toast.success('Đã gửi khoá học cho Admin duyệt');
      invalidate();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gửi duyệt thất bại';
      toast.error(msg);
    }
  };

  // Filter on the client by title (search query already debounced by re-render).
  const filteredCourses = useMemo(() => {
    const all = query.data?.data ?? [];
    if (!search) return all;
    const needle = search.toLowerCase();
    return all.filter((c) => c.title.toLowerCase().includes(needle));
  }, [query.data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Khoá học của tôi</h1>
          <p className="mt-1 text-sm text-muted">
            Quản lý khoá học bạn đã tạo. Lưu trữ tạm dừng đăng ký mới — chỉ Quản trị viên mới được
            xoá vĩnh viễn.
          </p>
        </div>
        <Button asChild>
          <Link href="/instructor/courses/new">
            <Plus className="h-4 w-4" />
            Tạo khoá mới
          </Link>
        </Button>
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên khoá học…"
          className="h-10 w-full rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 sm:max-w-sm"
        />
        <div className="flex gap-1 rounded-button border border-border p-1">
          <button
            type="button"
            onClick={() => setView('grid')}
            aria-pressed={view === 'grid'}
            title="Lưới"
            className={
              'inline-flex h-8 w-8 items-center justify-center rounded transition-colors ' +
              (view === 'grid' ? 'bg-primary text-white' : 'text-muted hover:bg-surface-2')
            }
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            title="Danh sách"
            className={
              'inline-flex h-8 w-8 items-center justify-center rounded transition-colors ' +
              (view === 'list' ? 'bg-primary text-white' : 'text-muted hover:bg-surface-2')
            }
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value || 'all'}
            type="button"
            onClick={() => setStatus(s.value)}
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

      {/* Body */}
      {query.isLoading ? (
        <div
          className={
            view === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2'
          }
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={
                view === 'grid'
                  ? 'h-72 animate-pulse rounded-card bg-surface-2'
                  : 'h-16 animate-pulse rounded-card bg-surface-2'
              }
            />
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface-2/30 py-16 text-center">
          <p className="text-sm text-muted">Chưa có khoá học nào khớp.</p>
          <Button asChild className="mt-4">
            <Link href="/instructor/courses/new">
              <Plus className="h-4 w-4" />
              Tạo khoá đầu tiên
            </Link>
          </Button>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              onArchive={handleArchive}
              onSubmitForReview={handleSubmitForReview}
              editHref={`/admin/curriculum?courseId=${c.id}`}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2/60 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Khoá học</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Chương / HV</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCourses.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{c.title}</div>
                    {c.description && (
                      <div className="line-clamp-1 text-xs text-muted">{c.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted">
                    {c._count?.chapters ?? 0} / {c._count?.enrollments ?? 0}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(c.createdAt).toLocaleDateString('vi-VN')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/courses/${c.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-button border border-border px-2.5 text-xs font-semibold text-muted hover:border-primary hover:text-primary transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Xem
                      </Link>
                      <Link
                        href={`/admin/curriculum?courseId=${c.id}`}
                        className="inline-flex h-8 items-center gap-1 rounded-button bg-primary/10 px-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Sửa
                      </Link>
                      {c.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => handleSubmitForReview(c)}
                          className="inline-flex h-8 items-center gap-1 rounded-button bg-primary px-2.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors"
                          title="Gửi duyệt cho Admin"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Gửi duyệt
                        </button>
                      )}
                      {c.status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          onClick={() => handleArchive(c)}
                          className="inline-flex h-8 items-center gap-1 rounded-button bg-surface-2 px-2.5 text-xs font-semibold text-muted hover:bg-amber-500/10 hover:text-amber-600 transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Lưu trữ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
