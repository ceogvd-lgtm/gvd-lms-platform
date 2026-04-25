'use client';

import { Button } from '@lms/ui';
import { CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { InputField } from '@/components/ui/input-field';
import { authApi, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(undefined);
    if (!email) {
      setError('Vui lòng nhập email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Email không hợp lệ');
      return;
    }

    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Có lỗi xảy ra, vui lòng thử lại sau');
      }
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">Kiểm tra hộp thư</h2>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          Nếu email <strong>{email}</strong> đã đăng ký, chúng tôi vừa gửi hướng dẫn đặt lại mật
          khẩu đến hộp thư của bạn. Liên kết có hiệu lực trong <strong>1 giờ</strong>.
        </p>
        <div className="space-y-3">
          <Link href="/login">
            <Button size="lg" className="w-full">
              Quay lại đăng nhập
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setEmail('');
            }}
            className="text-sm text-slate-500 hover:text-primary dark:text-slate-400"
          >
            Gửi đến email khác
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-slate-900 dark:text-white">Quên mật khẩu</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nhập email đăng ký — chúng tôi sẽ gửi link đặt lại mật khẩu.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          type="email"
          label="Email"
          placeholder="you@example.com"
          icon={Mail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          autoComplete="email"
          required
        />

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Nhớ ra mật khẩu rồi?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Đăng nhập
        </Link>
      </p>
    </>
  );
}
