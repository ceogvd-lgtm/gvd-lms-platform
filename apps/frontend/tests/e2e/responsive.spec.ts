import { test, expect } from '@playwright/test';

test.describe('Responsive layout', () => {
  test('login page on iPhone 12 viewport', async ({ page }) => {
    await page.goto('/login');
    // Email label must still be visible on 390px wide screen
    await expect(page.getByLabel(/email/i)).toBeVisible();
    // No horizontal scroll at login viewport
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('verify page renders on mobile', async ({ page }) => {
    await page.goto('/verify/TEST-CODE');
    await expect(page.locator('body')).toBeVisible();
  });
});
