'use client';

import { Button } from '@lms/ui';
import { Lock, Mail, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { GoogleButton } from '@/components/auth/google-button';
import { InputField } from '@/components/ui/input-field';
import { ApiError, authApi } from '@/lib/api';

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`])[\s\S]{8,}$/;

interface FieldErrors {
  email?: string;
  name?: string;
  password?: string;
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!email) e.email = 'Vui lòng nhập email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Email không hợp lệ';
    if (!name || name.trim().length < 2) e.name = 'Họ tên phải có ít nhất 2 ký tự';
    if (!password) e.password = 'Vui lòng nhập mật khẩu';
    else if (!PASSWORD_REGEX.test(password))
      e.password = 'Tối thiểu 8 ký tự, 1 chữ hoa, 1 số và 1 ký tự đặc biệt';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authApi.register({ email, name: name.trim(), password });
      toast.success(res.message);
      setDone(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Đăng ký thất bại';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
          Kiểm tra email của bạn
        </h2>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          Chúng tôi đã gửi liên kết xác nhận đến <strong>{email}</strong>. Liên kết có hiệu lực
          trong 24 giờ.
        </p>
        <Link href="/login">
          <Button size="lg" className="w-full">
            Quay lại đăng nhập
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Tạo tài khoản</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Bắt đầu hành trình học tập với GVD next gen LMS
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <InputField
          label="Họ và tên"
          icon={UserIcon}
          autoComplete="name"
          placeholder="Nguyễn Văn A"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={loading}
        />
        <InputField
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          disabled={loading}
        />
        <InputField
          label="Mật khẩu"
          icon={Lock}
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          togglePassword
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          disabled={loading}
        />
        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
          Tối thiểu 8 ký tự, 1 chữ hoa, 1 số và 1 ký tự đặc biệt.
        </p>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs uppercase tracking-wider text-slate-400">hoặc</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <GoogleButton label="Đăng ký bằng Google" />

      <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400">
        Đã có tài khoản?{' '}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-700">
          Đăng nhập
        </Link>
      </p>
    </>
  );
}
