'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lms/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { adminContentApi, ApiError, type AdminCourseRow } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface Props {
  open: boolean;
  onClose: () => void;
  course: AdminCourseRow | null;
  onSuccess: () => void;
}

/**
 * Delete-course confirmation modal.
 *
 * Shows the "blast radius" (enrollments, chapters, lessons, active
 * certificates) so the admin understands exactly who gets affected.
 * Requires typing the exact course title to confirm — prevents
 * accidental delete on a misclick.
 */
export function ContentDeleteModal({ open, onClose, course, onSuccess }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [typedTitle, setTypedTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the confirmation input when the modal opens — uses a ref instead
  // of `autoFocus` to satisfy the jsx-a11y rule.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const impactQuery = useQuery({
    queryKey: ['course-impact', course?.id],
    queryFn: () => adminContentApi.getImpact(course!.id, accessToken!),
    enabled: !!course && open,
    placeholderData: keepPreviousData,
  });

  if (!course) return null;

  const impact = impactQuery.data;
  const titleMatches = typedTitle.trim() === course.title;

  const handleDelete = async () => {
    if (!titleMatches) return;
    setSubmitting(true);
    try {
      await adminContentApi.deleteCourse(course.id, accessToken!);
      toast.success(`Đã xoá "${course.title}"`);
      setTypedTitle('');
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Xoá thất bại';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setTypedTitle('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="border-red-500/40 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Xoá khoá học
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-card border-2 border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm font-semibold text-foreground">{course.title}</p>
            <p className="text-xs text-muted">GV: {course.instructor.name}</p>
          </div>

          {impactQuery.isLoading ? (
            <div className="h-24 animate-pulse rounded-card bg-surface-2" />
          ) : impact ? (
            <div className="rounded-card bg-warning/10 p-4">
              <p className="mb-2 text-sm font-semibold text-warning">Hành động này sẽ ảnh hưởng:</p>
              <ul className="space-y-1 text-sm">
                <li>
                  • <strong>{impact.enrollmentCount}</strong> học viên đang tham gia
                </li>
                <li>
                  • <strong>{impact.chapterCount}</strong> chương, {impact.lessonCount} bài giảng
                </li>
                <li>
                  • <strong>{impact.activeCertificates}</strong> chứng chỉ đang hiệu lực
                </li>
              </ul>
              <p className="mt-2 text-xs text-muted">
                Khoá học sẽ bị đánh dấu xoá (soft delete) — có thể khôi phục từ Audit Log nếu cần.
              </p>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="confirm-title"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Nhập chính xác tên khoá học để xác nhận:
            </label>
            <input
              ref={inputRef}
              id="confirm-title"
              type="text"
              value={typedTitle}
              onChange={(e) => setTypedTitle(e.target.value)}
              placeholder={course.title}
              className="h-10 w-full rounded-button border border-border bg-background px-3.5 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!titleMatches || submitting}
          >
            {submitting ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
