import { defineConfig, devices } from '@playwright/test';

// Target an already-running stack. Locally: `docker compose up` (web on :3009)
// then `E2E_BASE_URL=http://localhost:3009 npm test`. In CI the deploy/staging
// URL is injected. Viewport matrix per §9.3: 375 / 768 / 1440.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3009';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
});
