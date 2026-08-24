import { defineConfig, devices } from '@playwright/test';

// baseURL points at the Angular frontend (served via nginx in docker-compose,
// or `ng serve` on :4200 for local dev — override with PLAYWRIGHT_BASE_URL).
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
