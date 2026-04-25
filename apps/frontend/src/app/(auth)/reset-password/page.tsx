'use client';

import { Button } from '@lms/ui';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { InputField } from '@/components/ui/input-field';
import { authApi, ApiError } from '@/lib/api';

// Regex khớp với PASSWORD_REGEX ở backend (register.dto.ts).
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`])[\s\S]{8,}$/;

interface FieldErrors {
  newPassword?: string;
  confirmPassword?: string;
}

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = params.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Token missing → báo lỗi ngay, không render form.
  if (!token) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
          Liên kết không hợp lệ
        </h2>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          Liên kết đặt lại mật khẩu thiếu token. Vui lòng yêu cầu lại.
        </p>
        <Link href="/forgot-password">
          <Button size="lg" className="w-full">
            Yêu cầu link mới
          </Button>
        </Link>
      </div>
    );
  }

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!newPassword) e.newPassword = 'Vui lòng nhập mật khẩu mới';
    else if (newPassword.length < 8) e.newPassword = 'Mật khẩu phải có ít nhất 8 ký tự';
    else if (!PASSWORD_REGEX.test(newPassword))
      e.newPassword = 'Mật khẩu phải có ít nhất 1 chữ HOA, 1 số và 1 ký tự đặc biệt';

    if (!confirmPassword) e.confirmPassword = 'Vui lòng nhập lại mật khẩu';
    else if (confirmPassword !== newPassword) e.confirmPassword = 'Mật khẩu xác nhận không khớp';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Có lỗi xảy ra, vui lòng thử lại');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
          Đặt lại thành công
        </h2>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          Mật khẩu của bạn đã được cập nhật. Đăng nhập ngay để tiếp tục.
        </p>
        <Link href="/login">
          <Button size="lg" className="w-full">
            Đăng nhập
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-slate-900 dark:text-white">Đặt lại mật khẩu</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nhập mật khẩu mới bên dưới. Tối thiểu 8 ký tự, có chữ HOA, số, ký tự đặc biệt.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          type="password"
          label="Mật khẩu mới"
          placeholder="••••••••"
          icon={Lock}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors.newPassword}
          autoComplete="new-password"
          togglePassword
          required
        />

        <InputField
          type="password"
          label="Nhập lại mật khẩu"
          placeholder="••••••••"
          icon={Lock}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
          togglePassword
          required
        />

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </>
  );
}
