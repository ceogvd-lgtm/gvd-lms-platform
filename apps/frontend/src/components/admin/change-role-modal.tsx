'use client';

import { Button } from '@lms/ui';
import { useState } from 'react';
import { toast } from 'sonner';

import { Modal } from '@/components/ui/modal';
import { RoleBadge } from '@/components/ui/role-badge';
import { ApiError } from '@/lib/api';
import type { Role } from '@/lib/rbac';

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

interface Props {
  open: boolean;
  onClose: () => void;
  target: AdminUser | null;
  /** Called with the new role — parent does the actual API call. */
  onConfirm: (newRole: Role) => Promise<void>;
}

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'INSTRUCTOR', 'STUDENT'];

export function ChangeRoleModal({ open, onClose, target, onConfirm }: Props) {
  const [selected, setSelected] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!target) return null;

  const chosen = selected ?? target.role;
  const unchanged = chosen === target.role;

  const handleConfirm = async () => {
    if (unchanged) return;
    setSubmitting(true);
    try {
      await onConfirm(chosen);
      toast.success(`Đã đổi vai trò của ${target.name}`);
      onClose();
      setSelected(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Đổi vai trò thất bại';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Đổi vai trò người dùng">
      <div className="space-y-5">
        {/* Target info */}
        <div className="rounded-card bg-slate-50 dark:bg-slate-800/50 p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-white truncate">{target.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{target.email}</p>
            </div>
            <RoleBadge role={target.role} />
          </div>
        </div>

        {/* Role picker */}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Vai trò mới</p>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => {
              const active = chosen === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelected(r)}
                  className={
                    'flex items-center justify-center gap-2 rounded-button border-2 px-3 py-2.5 text-sm font-medium transition-all ' +
                    (active
                      ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600')
                  }
                >
                  <RoleBadge role={r} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Warning */}
        {!unchanged && (
          <div className="rounded-card bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            ⚠️ Hành động này sẽ thay đổi quyền truy cập của người dùng ngay lập tức và được ghi lại
            trong Audit Log.
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={unchanged || submitting}>
            {submitting ? 'Đang xử lý…' : 'Xác nhận'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
