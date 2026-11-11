import { defineConfig } from '@playwright/test';

const liveBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: liveBaseUrl || 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: liveBaseUrl ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/movie-site/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
