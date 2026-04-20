import { test, expect } from '@playwright/test';

test.describe('smoke', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/GVD|LMS|Học|Đăng/i);
    // Email input must be present — we anchor on the label.
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('verify page loads with unknown code', async ({ page }) => {
    await page.goto('/verify/FAKE-CODE-XYZ');
    // Should render a 404-style card or redirect to a sensible page
    await expect(page.locator('body')).toBeVisible();
  });
});
