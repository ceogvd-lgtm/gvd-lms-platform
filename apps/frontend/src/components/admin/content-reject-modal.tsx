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
 * Reject a pending course with a mandatory reason. Writes audit log
 * entry `CONTENT_REJECT` with the reason via backend.
 */
export function ContentRejectModal({ open, onClose, course, onSuccess }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!course) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Phải nhập lý do từ chối');
      return;
    }
    setSubmitting(true);
    try {
      await adminContentApi.reject(course.id, reason.trim(), accessToken!);
      toast.success(`Đã từ chối "${course.title}"`);
      setReason('');
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Từ chối thất bại';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Từ chối khoá học</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-card bg-surface-2/50 p-3">
              <p className="truncate text-sm font-semibold">{course.title}</p>
              <p className="text-xs text-muted">GV: {course.instructor.name}</p>
            </div>

            <div>
              <label
                htmlFor="reject-reason"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Lý do từ chối <span className="text-red-500">*</span>
              </label>
              <textarea
                ref={textareaRef}
                id="reject-reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: Thiếu nội dung về an toàn lao động ở chương 2…"
                className="w-full rounded-button border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
                maxLength={500}
              />
              <p className="mt-1 text-xs text-muted">
                Lý do sẽ được gửi về giảng viên và lưu vào Audit Log.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Huỷ
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? 'Đang xử lý…' : 'Từ chối'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
