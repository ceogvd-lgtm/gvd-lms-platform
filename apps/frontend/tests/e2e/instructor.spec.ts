import { test, expect } from '@playwright/test';

import { seedAuth } from './helpers/auth-storage';
import { instructorUser, json, mockApi } from './helpers/mock-api';

test.describe('Instructor flows', () => {
  test('instructor dashboard renders', async ({ page }) => {
    const api = mockApi(page);
    api.on('GET', '**/auth/me', json(200, instructorUser));
    api.on(
      'GET',
      '**/instructor/dashboard**',
      json(200, {
        courses: [],
        pendingReviews: 0,
        totalStudents: 0,
        avgRating: 0,
      }),
    );
    api.on('GET', '**/notifications**', json(200, { data: [], total: 0 }));

    await seedAuth(page, instructorUser);
    await api.attach();
    await page.goto('/instructor/dashboard');
    await expect(page.locator('body')).toContainText(/giảng viên|instructor|khoá học|dashboard/i);
  });

  test('instructor courses list page mounts', async ({ page }) => {
    const api = mockApi(page);
    api.on('GET', '**/auth/me', json(200, instructorUser));
    api.on(
      'GET',
      '**/courses**',
      json(200, {
        data: [
          {
            id: 'c1',
            title: 'ATVSLĐ cơ bản',
            status: 'DRAFT',
            thumbnailUrl: null,
            publishedAt: null,
            _count: { enrollments: 0, chapters: 2 },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    );
    api.on('GET', '**/notifications**', json(200, { data: [], total: 0 }));

    await seedAuth(page, instructorUser);
    await api.attach();
    await page.goto('/instructor/courses');
    await expect(page.locator('body')).toContainText(/ATVSLĐ|DRAFT|Khoá|Tạo/i);
  });
});
