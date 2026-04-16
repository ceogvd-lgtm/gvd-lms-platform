'use client';

import { Button } from '@lms/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { authApi } from '@/lib/api';

type State = 'loading' | 'ok' | 'error';

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('Thiếu token xác thực');
      return;
    }
    authApi
      .verifyEmail(token)
      .then((r) => {
        setState('ok');
        setMessage(r.message);
      })
      .catch((err: Error) => {
        setState('error');
        setMessage(err.message || 'Token không hợp lệ');
      });
  }, [token]);

  return (
    <div className="text-center">
      {state === 'loading' && (
        <>
          <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-primary-100 border-t-primary" />
          <p className="text-slate-600 dark:text-slate-400">Đang xác thực email…</p>
        </>
      )}
      {state === 'ok' && (
        <>
          <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
            Xác thực thành công
          </h2>
          <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">{message}</p>
          <Link href="/login">
            <Button size="lg" className="w-full">
              Đăng nhập
            </Button>
          </Link>
        </>
      )}
      {state === 'error' && (
        <>
          <div className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">
            Xác thực thất bại
          </h2>
          <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">{message}</p>
          <Link href="/register">
            <Button size="lg" variant="outline" className="w-full">
              Đăng ký lại
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}
