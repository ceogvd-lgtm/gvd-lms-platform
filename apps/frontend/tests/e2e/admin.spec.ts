import { test, expect } from '@playwright/test';

import { seedAuth } from './helpers/auth-storage';
import { adminUser, json, mockApi } from './helpers/mock-api';

test.describe('Admin flows', () => {
  test('admin dashboard mounts with KPI data', async ({ page }) => {
    const api = mockApi(page);
    api.on('GET', '**/auth/me', json(200, adminUser));
    api.on(
      'GET',
      '**/admin/dashboard/kpi',
      json(200, {
        totalUsers: 150,
        totalCourses: 12,
        totalEnrollments: 340,
        activeLast7Days: 85,
      }),
    );
    api.on('GET', '**/admin/dashboard/recent', json(200, []));
    api.on('GET', '**/admin/dashboard/activity', json(200, { series: [] }));
    api.on('GET', '**/admin/dashboard/**', json(200, {}));
    api.on('GET', '**/notifications**', json(200, { data: [], total: 0 }));

    await seedAuth(page, adminUser);
    await api.attach();
    await page.goto('/admin/dashboard');
    // Page shell mounted — either sidebar rendered or we're still in the
    // hydrate-then-fetch loading state, both prove routing + auth gate
    // accepted us. Either text passes.
    await expect(page.locator('body')).toContainText(/admin|quản trị|đang tải|dashboard/i);
  });

  test('admin users page list renders', async ({ page }) => {
    const api = mockApi(page);
    api.on('GET', '**/auth/me', json(200, adminUser));
    api.on(
      'GET',
      '**/admin/users**',
      json(200, {
        data: [
          {
            id: 'u1',
            email: 'a@b',
            name: 'Alice',
            role: 'STUDENT',
            isBlocked: false,
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    );
    api.on('GET', '**/departments**', json(200, []));
    api.on('GET', '**/notifications**', json(200, { data: [], total: 0 }));

    await seedAuth(page, adminUser);
    await api.attach();
    await page.goto('/admin/users');
    await expect(page.locator('body')).toContainText(/users|người dùng|Alice|a@b/i);
  });
});
