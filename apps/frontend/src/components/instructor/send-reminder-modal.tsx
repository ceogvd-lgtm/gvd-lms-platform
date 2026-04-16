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
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError, instructorAnalyticsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface Props {
  open: boolean;
  onClose: () => void;
  studentIds: string[];
  courseId: string | null;
  /** Show student names so the instructor knows who they're messaging. */
  studentSummary: string;
}

export function SendReminderModal({ open, onClose, studentIds, courseId, studentSummary }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!courseId || studentIds.length === 0) return;
    setSubmitting(true);
    try {
      const result = await instructorAnalyticsApi.sendReminder(
        { studentIds, courseId, message: message.trim() || undefined },
        accessToken!,
      );
      if (result.failed.length === 0) {
        toast.success(`Đã gửi nhắc tới ${result.sent.length} học viên`);
      } else {
        toast.warning(
          `${result.sent.length} thành công, ${result.failed.length} thất bại — xem Audit Log`,
        );
      }
      setMessage('');
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Gửi nhắc thất bại';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Gửi email nhắc nhở
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-card bg-surface-2/50 p-3">
            <p className="text-xs uppercase tracking-wider text-muted">Nhắc tới</p>
            <p className="mt-1 text-sm font-semibold">
              {studentIds.length} học viên: {studentSummary}
            </p>
          </div>

          <div>
            <label htmlFor="reminder-msg" className="mb-1.5 block text-sm font-medium">
              Lời nhắn (tuỳ chọn)
            </label>
            <textarea
              id="reminder-msg"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Vd: Bạn ơi đã 10 ngày không thấy bạn quay lại, cố gắng hoàn thành bài cuối nhé!"
              maxLength={500}
              className="w-full rounded-button border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
            />
            <p className="mt-1 text-xs text-muted">
              Email sử dụng template &ldquo;at-risk-alert&rdquo; chuẩn — lời nhắn này được lưu vào
              Audit Log để bạn theo dõi.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || studentIds.length === 0}>
            <Mail className="h-4 w-4" />
            {submitting ? 'Đang gửi…' : `Gửi tới ${studentIds.length} HV`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
