import { test, expect } from '@playwright/test';

// Local-SEO surface (F-024, §4.4). A town landing page must carry LocalBusiness
// structured data so it can be indexed and cited. We discover a real town from
// the /rent index rather than hard-coding a slug. The page uses the more
// specific EquipmentRentalAgency type (a LocalBusiness subtype).

test('a town page emits LocalBusiness JSON-LD', async ({ page }) => {
  await page.goto('/rent');
  const firstTown = page.locator('a[href^="/rent/"]').first();
  const count = await firstTown.count();
  test.skip(count === 0, 'No towns published in this environment');

  await firstTown.click();
  await expect(page).toHaveURL(/\/rent\/.+/);

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const joined = blocks.join('\n');
  expect(joined).toContain('schema.org');
  // EquipmentRentalAgency is a LocalBusiness subtype; accept either.
  expect(joined).toMatch(/LocalBusiness|EquipmentRentalAgency/);
  expect(joined).toContain('areaServed');
  await expect(page.locator('h1').first()).toBeVisible();
});

test('sitemap and robots are served', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain('<urlset');

  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBeTruthy();
});
