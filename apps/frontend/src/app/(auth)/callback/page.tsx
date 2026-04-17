'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Landing target for Google OAuth callback.
 * Backend redirects here with `?accessToken=&refreshToken=`. We fetch
 * the full user profile from `/auth/me` (the JWT only carries sub/email/role —
 * name + avatar live in the DB) and hydrate the Zustand store with it
 * before bouncing the user to the home page.
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

    (async () => {
      try {
        const user = await authApi.me(accessToken);
        setSession({ accessToken, refreshToken, user });
        toast.success(`Xin chào ${user.name}`);
        router.replace('/');
      } catch {
        toast.error('Không lấy được thông tin tài khoản');
        router.replace('/login');
      }
    })();
  }, [params, router, setSession]);

  return (
    <div className="text-center">
      <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-primary-100 border-t-primary" />
      <p className="text-slate-600 dark:text-slate-400">Đang hoàn tất đăng nhập…</p>
    </div>
  );
}
