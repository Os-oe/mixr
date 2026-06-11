import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  retries: 0,
  workers: 1, // shared in-memory API state -> serial
  use: {
    baseURL: 'http://localhost:8787',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    headless: true
  },
  webServer: {
    command: 'npm run build && node server/dev.js --serve-dist',
    port: 8787,
    reuseExistingServer: false,
    timeout: 120000
  }
});
