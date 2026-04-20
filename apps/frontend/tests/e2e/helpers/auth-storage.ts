import type { Page } from '@playwright/test';

import { fakeAccessToken, fakeRefreshToken, type adminUser as AdminUser } from './mock-api';

/**
 * Seed the Zustand auth store in localStorage so the target page skips
 * the login redirect. Must be called before `page.goto(protectedRoute)`.
 */
export async function seedAuth(page: Page, user: typeof AdminUser): Promise<void> {
  await page.addInitScript(
    ({ user, accessToken, refreshToken }) => {
      const state = {
        state: {
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        },
        version: 0,
      };
      window.localStorage.setItem('lms-auth', JSON.stringify(state));
    },
    { user, accessToken: fakeAccessToken, refreshToken: fakeRefreshToken },
  );
}
