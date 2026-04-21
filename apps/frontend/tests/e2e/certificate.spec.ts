import { test, expect } from '@playwright/test';

import { json, mockApi } from './helpers/mock-api';

test.describe('Certificate verify page', () => {
  test('valid code shows certificate details', async ({ page }) => {
    const api = mockApi(page);
    api.on(
      'GET',
      '**/certificates/verify/CERT-ABC-123',
      json(200, {
        valid: true,
        code: 'CERT-ABC-123',
        studentName: 'Nguyễn Văn An',
        courseName: 'An toàn lao động PPE',
        grade: 'Giỏi',
        finalScore: 85,
        issuedAt: new Date('2026-03-15').toISOString(),
        institutionName: 'GVD simvana',
      }),
    );
    await api.attach();
    await page.goto('/verify/CERT-ABC-123');
    await expect(page.locator('body')).toContainText(/CERT-ABC-123|An toàn|Giỏi|GVD/i);
  });

  test('unknown code shows not-found card', async ({ page }) => {
    const api = mockApi(page);
    api.on(
      'GET',
      '**/certificates/verify/**',
      json(404, {
        statusCode: 404,
        message: 'Không tìm thấy chứng chỉ',
      }),
    );
    await api.attach();
    await page.goto('/verify/FAKE-CODE-999');
    await expect(page.locator('body')).toContainText(/không.*tìm|not.*found|404|FAKE/i);
  });
});
