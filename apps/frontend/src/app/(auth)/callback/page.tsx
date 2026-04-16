'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/auth-store';

/**
 * Landing target for Google OAuth callback.
 * Backend redirects here with `?accessToken=&refreshToken=`.
 * We stash tokens in the Zustand store then bounce to the home page.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    if (!accessToken || !refreshToken) {
      toast.error('Đăng nhập Google thất bại');
      router.replace('/login');
      return;
    }
    setSession({
      accessToken,
      refreshToken,
      user: {
        id: '',
        email: '',
        name: '',
        role: 'STUDENT',
        avatar: null,
        emailVerified: true,
        is2FAEnabled: false,
      },
    });
    toast.success('Đăng nhập thành công');
    router.replace('/');
  }, [params, router, setSession]);

  return (
    <div className="text-center">
      <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-primary-100 border-t-primary" />
      <p className="text-slate-600 dark:text-slate-400">Đang hoàn tất đăng nhập…</p>
    </div>
  );
}
