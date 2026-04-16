'use client';

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@lms/ui';
import { useState } from 'react';
import { toast } from 'sonner';

import { adminApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Create a new ADMIN account (SUPER_ADMIN only — LAW 1).
 *
 * The page-level guard hides this button for non-SUPER_ADMIN, but the
 * backend enforces it unconditionally via @Roles(SUPER_ADMIN) +
 * AdminRulesService.check(..., 'CREATE_ADMIN').
 */
export function CreateAdminModal({ open, onClose, onSuccess }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail('');
    setName('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }
    setSubmitting(true);
    try {
      await adminApi.createAdmin({ email, name, password }, accessToken!);
      toast.success(`Đã tạo ADMIN ${name}`);
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Tạo admin thất bại';
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
            <DialogTitle>Tạo tài khoản Admin</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-card bg-warning/10 px-4 py-3 text-sm text-warning">
              Chỉ Super Admin mới có quyền tạo tài khoản Admin mới (LUẬT 1). Hành động này sẽ được
              ghi vào Audit Log.
            </div>
            <Input
              label="Họ và tên"
              placeholder="Nguyễn Văn A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="admin@gvd.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Mật khẩu tạm thời"
              type="password"
              placeholder="Tối thiểu 8 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              helper="Admin mới sẽ được nhắc đổi mật khẩu ngay lần đăng nhập đầu tiên."
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Huỷ
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang tạo…' : 'Tạo Admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
