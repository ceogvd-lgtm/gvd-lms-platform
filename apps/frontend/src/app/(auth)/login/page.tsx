'use client';

import { Button } from '@lms/ui';
import { Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { GoogleButton } from '@/components/auth/google-button';
import { InputField } from '@/components/ui/input-field';
import { authApi, isLogin2FA, ApiError } from '@/lib/api';
import { homeForRole } from '@/lib/auth-redirect';
import { useAuthStore } from '@/lib/auth-store';

interface FieldErrors {
  email?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!email) e.email = 'Vui lòng nhập email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Email không hợp lệ';
    if (!password) e.password = 'Vui lòng nhập mật khẩu';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      if (isLogin2FA(res)) {
        sessionStorage.setItem('lms-temp-token', res.tempToken);
        // Kick off the first OTP send — the /2fa screen polls /send on mount if no cooldown.
        await authApi.send2FA(res.tempToken).catch(() => undefined);
        router.push('/2fa');
      } else {
        setSession(res);
        toast.success(`Chào mừng ${res.user.name}!`);
        router.push(homeForRole(res.user.role));
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Đăng nhập thất bại';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Đăng nhập</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Chào mừng bạn trở lại với GVD simvana
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
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
          autoComplete="current-password"
          placeholder="••••••••"
          togglePassword
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          disabled={loading}
        />

        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:text-primary-700"
          >
            Quên mật khẩu?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner />
              Đang đăng nhập…
            </span>
          ) : (
            'Đăng nhập'
          )}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs uppercase tracking-wider text-slate-400">hoặc</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <GoogleButton label="Đăng nhập bằng Google" />

      <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400">
        Chưa có tài khoản?{' '}
        <Link href="/register" className="font-semibold text-primary hover:text-primary-700">
          Đăng ký ngay
        </Link>
      </p>
    </>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
