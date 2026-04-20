import { test, expect } from '@playwright/test';

import { seedAuth } from './helpers/auth-storage';
import { json, mockApi, studentUser } from './helpers/mock-api';

test.describe('Student learning', () => {
  test('logged-in student sees dashboard shell', async ({ page }) => {
    const api = mockApi(page);
    api.on('GET', '**/auth/me', json(200, studentUser));
    api.on(
      'GET',
      '**/students/dashboard',
      json(200, {
        streak: 3,
        xp: 120,
        enrollments: [],
        upcomingLessons: [],
        recentCertificates: [],
        notifications: [],
        recommendations: [],
      }),
    );
    api.on('GET', '**/students/certificates', json(200, []));
    api.on('GET', '**/students/my-learning', json(200, []));
    api.on('GET', '**/students/progress', json(200, { courses: [] }));
    api.on('GET', '**/students/xp', json(200, { xp: 120, streak: 3 }));
    api.on('GET', '**/ai/recommendations', json(200, []));
    api.on('GET', '**/notifications**', json(200, { data: [], total: 0 }));

    await seedAuth(page, studentUser);
    await api.attach();
    await page.goto('/student/dashboard');

    // Page loaded — user greeting or sidebar visible
    await expect(page.locator('body')).toContainText(/Sinh|Học|Bài|Chào|Dashboard/i);
  });

  test('login form validates missing credentials', async ({ page }) => {
    await page.goto('/login');
    const submit = page.getByRole('button', { name: /đăng nhập|login/i }).first();
    await submit.click();
    await expect(page.locator('body')).toContainText(/email|mật khẩu/i);
  });
});
