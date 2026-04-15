'use client';

import { Button } from '@lms/ui';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/ui/modal';
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
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-card bg-slate-50 dark:bg-slate-800/50 p-4">
          <div
            className={
              'flex h-12 w-12 items-center justify-center rounded-full ' +
              (willBlock
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400')
            }
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">{target.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{target.email}</p>
            <div className="mt-1">
              <RoleBadge role={target.role} />
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          {willBlock
            ? 'Người dùng sẽ không thể đăng nhập vào hệ thống cho đến khi được mở khoá lại. Hành động này được ghi lại trong Audit Log.'
            : 'Người dùng sẽ có thể đăng nhập lại bình thường. Hành động này được ghi lại trong Audit Log.'}
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={willBlock ? 'bg-red-600 hover:bg-red-700' : ''}
          >
            {submitting ? 'Đang xử lý…' : willBlock ? 'Khoá' : 'Mở khoá'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
