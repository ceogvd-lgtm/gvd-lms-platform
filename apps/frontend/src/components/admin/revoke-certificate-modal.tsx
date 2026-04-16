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
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { adminCertificatesApi, ApiError, type CertificateRow } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface Props {
  open: boolean;
  onClose: () => void;
  certificate: CertificateRow | null;
  onSuccess: () => void;
}

export function RevokeCertificateModal({ open, onClose, certificate, onSuccess }: Props) {
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

  if (!certificate) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Phải nhập lý do thu hồi');
      return;
    }
    setSubmitting(true);
    try {
      await adminCertificatesApi.revoke(certificate.id, reason.trim(), accessToken!);
      toast.success(`Đã thu hồi chứng chỉ ${certificate.code}`);
      setReason('');
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Thu hồi thất bại';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="border-red-500/40">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Thu hồi chứng chỉ
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-card border-2 border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-semibold">{certificate.code}</p>
                  <p className="truncate text-xs text-muted">
                    {certificate.student.name} · {certificate.course.title}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {new Date(certificate.issuedAt).toLocaleDateString('vi-VN')}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="revoke-reason"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Lý do thu hồi <span className="text-red-500">*</span>
              </label>
              <textarea
                ref={textareaRef}
                id="revoke-reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: Phát hiện gian lận trong bài kiểm tra cuối khoá…"
                className="w-full rounded-button border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20"
                maxLength={500}
              />
              <p className="mt-1 text-xs text-muted">
                Chứng chỉ sẽ chuyển sang trạng thái REVOKED. Lý do được lưu vĩnh viễn vào Audit Log.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Huỷ
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting || !reason.trim()}>
              {submitting ? 'Đang xử lý…' : 'Thu hồi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
