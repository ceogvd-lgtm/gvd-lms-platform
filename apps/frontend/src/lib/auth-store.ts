'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { LoginSuccessPayload } from './api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: LoginSuccessPayload['user'] | null;
  setSession: (s: LoginSuccessPayload) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (s) =>
        set({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          user: s.user,
        }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'lms-auth' },
  ),
);
