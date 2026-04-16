'use client';

import { useEffect, useState } from 'react';
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
    {
      name: 'lms-auth',
      // Only persist these three fields. Anything else (e.g. stale
      // `_hasHydrated` from a previous build) is ignored when reading
      // from localStorage and never written back.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);

/**
 * Returns `true` once Zustand `persist` has finished rehydrating from
 * localStorage on the client. Always `false` during SSR and on the very
 * first client render (before the rehydration tick).
 *
 * Use this in any layout/page that gates on auth — without it you'll
 * read `accessToken === null` for the first render and bounce the user
 * to /login even though they're logged in.
 *
 * Pattern is the one documented in the Zustand persist guide:
 *   https://zustand.docs.pmnd.rs/integrations/persisting-store-data#how-can-i-check-if-my-store-has-been-hydrated
 */
export function useHasHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    // Subscribe to the "finish" event for any future hydration.
    const unsub = useAuthStore.persist.onFinishHydration(() => setHasHydrated(true));
    // Also check the current state — if persist already finished before
    // this effect ran (rare but possible on hot reload), flip immediately.
    if (useAuthStore.persist.hasHydrated()) {
      setHasHydrated(true);
    }
    return unsub;
  }, []);

  return hasHydrated;
}
