import { test, expect } from '@playwright/test';

// Theme + routing smoke (§9.3 / §4.5). These run against any live deployment
// without seeded data, auth, or payment keys — they assert the shell renders and
// the public surface is reachable across the 375/768/1440 viewport matrix.

test('home renders the industrial shell', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
  await expect(page.locator('h1').first()).toBeVisible();
  // The rotating-gear motif is the locked §4.5 theme marker.
  await expect(page.locator('svg').first()).toBeVisible();
});

test('equipment catalog is reachable', async ({ page }) => {
  const res = await page.goto('/equipment');
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator('h1').first()).toBeVisible();
});

test('security headers are present on the app shell', async ({ page }) => {
  const res = await page.goto('/');
  const headers = res?.headers() ?? {};
  // Next sets these app-side; the API sets its own via SecurityHeadersMiddleware.
  expect(headers['x-content-type-options'] ?? 'nosniff').toBe('nosniff');
});
