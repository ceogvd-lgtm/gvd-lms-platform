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
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { RoleBadge } from '@/components/ui/role-badge';
import { ApiError } from '@/lib/api';
import type { Role } from '@/lib/rbac';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isBlocked: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  target: AdminUser | null;
  onConfirm: (blocked: boolean) => Promise<void>;
}

export function BlockUserModal({ open, onClose, target, onConfirm }: Props) {
  const [submitting, setSubmitting] = useState(false);

  if (!target) return null;

  const willBlock = !target.isBlocked;
  const Icon = willBlock ? ShieldAlert : ShieldCheck;
  const title = willBlock ? 'Khoá người dùng' : 'Mở khoá người dùng';

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(willBlock);
      toast.success(willBlock ? `Đã khoá ${target.name}` : `Đã mở khoá ${target.name}`);
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Thao tác thất bại';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <div className="flex items-center gap-4 rounded-card bg-surface-2/50 p-4">
            <div
              className={
                'flex h-12 w-12 items-center justify-center rounded-full ' +
                (willBlock ? 'bg-error/10 text-error' : 'bg-success/10 text-success')
              }
            >
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{target.name}</p>
              <p className="truncate text-xs text-muted">{target.email}</p>
              <div className="mt-1">
                <RoleBadge role={target.role} />
              </div>
            </div>
          </div>

          <p className="text-sm text-muted">
            {willBlock
              ? 'Người dùng sẽ không thể đăng nhập vào hệ thống cho đến khi được mở khoá lại. Hành động này được ghi lại trong Audit Log.'
              : 'Người dùng sẽ có thể đăng nhập lại bình thường. Hành động này được ghi lại trong Audit Log.'}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            type="button"
            variant={willBlock ? 'destructive' : 'primary'}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? 'Đang xử lý…' : willBlock ? 'Khoá' : 'Mở khoá'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
