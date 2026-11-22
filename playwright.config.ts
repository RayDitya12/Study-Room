import { defineConfig, devices } from '@playwright/test';

const CLIENT_PORT = process.env.PLAYWRIGHT_PORT || '5176';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:memory -w server',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 15000,
    },
    {
      command: `npx vite --port ${CLIENT_PORT} client`,
      url: `http://localhost:${CLIENT_PORT}`,
      reuseExistingServer: true,
      timeout: 15000,
    },
  ],
});
