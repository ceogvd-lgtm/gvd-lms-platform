'use client';

import { Breadcrumb, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@lms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { coursesApi } from '@/lib/curriculum';

/**
 * Phase 18 — Edit course page cho instructor.
 *
 * Trước đây nút "Sửa" trên /instructor/courses trỏ sang /admin/curriculum
 * (ADMIN-only) → admin layout đẩy instructor về `/`. Đây là dead link.
 *
 * Trang này fill gap: instructor chỉ sửa được `title` + `description`.
 *   - Không đụng `subjectId` (đổi môn học sau khi tạo khóa có side effect
 *     FK phức tạp cho chapters đã có → phase sau nếu cần).
 *   - Không đụng `thumbnailUrl` vì UpdateCourseDto bắt @IsUrl require_protocol
 *     → relative /minio/ URL sẽ fail. Sửa thumbnail qua workflow upload
 *     riêng nếu cần.
 *   - Không đổi `status` ở đây — instructor dùng nút "Gửi duyệt" / "Lưu trữ"
 *     ở trang list, admin dùng "Duyệt / Từ chối" ở /admin/content.
 */
export default function EditCoursePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams<{ id: string }>();
  const courseId = params?.id;
  const token = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => coursesApi.findOne(courseId!, token!),
    enabled: !!courseId && !!token,
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Prefill khi query xong. Không phụ thuộc vào unsaved edits — nếu user
  // đã gõ rồi refetch (VD invalidate từ tab khác), giữ nguyên input.
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) {
      setTitle(query.data.title ?? '');
      setDescription(query.data.description ?? '');
    }
  }, [query.data, dirty]);

  const mutation = useMutation({
    mutationFn: () =>
      coursesApi.update(
        courseId!,
        {
          title: title.trim(),
          description: description.trim() || undefined,
        },
        token!,
      ),
    onSuccess: () => {
      toast.success('Đã cập nhật khoá học');
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      setDirty(false);
      router.push('/instructor/courses');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Cập nhật thất bại');
    },
  });

  const handleSave = (ev: React.FormEvent) => {
    ev.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      toast.error('Tên khoá học phải có ít nhất 3 ký tự');
      return;
    }
    if (trimmed.length > 200) {
      toast.error('Tên khoá học tối đa 200 ký tự');
      return;
    }
    if (description.length > 2000) {
      toast.error('Mô tả tối đa 2000 ký tự');
      return;
    }
    mutation.mutate();
  };

  // ---------- Render ----------
  if (!courseId) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: 'Khoá học của tôi', href: '/instructor/courses' },
            { label: 'Chỉnh sửa' },
          ]}
        />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted">
            ID khoá không hợp lệ
          </CardContent>
        </Card>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Khoá học của tôi', href: '/instructor/courses' },
            { label: 'Chỉnh sửa' },
          ]}
        />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: 'Khoá học của tôi', href: '/instructor/courses' },
            { label: 'Chỉnh sửa' },
          ]}
        />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted">
              Không tìm thấy khoá học hoặc bạn không có quyền chỉnh sửa.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/instructor/courses">
                <ArrowLeft className="h-4 w-4" />
                Quay lại
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const course = query.data;
  const submitting = mutation.isPending;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Khoá học của tôi', href: '/instructor/courses' },
          { label: course.title },
          { label: 'Chỉnh sửa' },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chỉnh sửa khoá học</h1>
          <p className="mt-1 text-sm text-muted">
            Sửa tên + mô tả. Để thêm/xoá chương và bài giảng, dùng trang chi tiết khoá.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/instructor/courses">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Thông tin cơ bản</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
                Tên khoá học <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                maxLength={200}
                placeholder="Ví dụ: An toàn lao động cơ bản"
                className="h-10 w-full rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-muted">3–200 ký tự. {title.trim().length}/200</p>
            </div>

            <div>
              <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
                Mô tả ngắn
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirty(true);
                }}
                rows={5}
                maxLength={2000}
                placeholder="Mô tả nội dung khoá học, đối tượng học viên…"
                className="w-full rounded-button border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                disabled={submitting}
              />
              <p className="mt-1 text-xs text-muted">
                Tối đa 2000 ký tự. {description.length}/2000
              </p>
            </div>

            {/* Thông tin readonly — instructor nhìn thấy nhưng không sửa được */}
            <div className="grid grid-cols-1 gap-3 rounded-card border border-dashed border-border bg-surface-2/40 p-4 text-xs sm:grid-cols-3">
              <div>
                <div className="font-semibold uppercase tracking-wider text-muted">Trạng thái</div>
                <div className="mt-0.5 text-sm text-foreground">{course.status}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wider text-muted">Môn học</div>
                <div className="mt-0.5 text-sm text-foreground">{course.subject?.name ?? '—'}</div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wider text-muted">Ngày tạo</div>
                <div className="mt-0.5 text-sm text-foreground">
                  {new Date(course.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/instructor/courses')}
            disabled={submitting}
          >
            Huỷ
          </Button>
          <Button type="submit" disabled={submitting || !dirty}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </div>
  );
}
