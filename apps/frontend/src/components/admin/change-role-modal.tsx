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
import { useState } from 'react';
import { toast } from 'sonner';

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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi vai trò người dùng</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          {/* Target info */}
          <div className="rounded-card bg-surface-2/50 p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{target.name}</p>
                <p className="truncate text-xs text-muted">{target.email}</p>
              </div>
              <RoleBadge role={target.role} />
            </div>
          </div>

          {/* Role picker */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Vai trò mới</p>
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
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50')
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
            <div className="rounded-card bg-warning/10 px-4 py-3 text-sm text-warning">
              Hành động này sẽ thay đổi quyền truy cập của người dùng ngay lập tức và được ghi lại
              trong Audit Log.
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={unchanged || submitting}>
            {submitting ? 'Đang xử lý…' : 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
