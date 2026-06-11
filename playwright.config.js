import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL=https://mixr.demo.osai.solutions npx playwright test -> live E2E
const LIVE = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  retries: 0,
  workers: 1, // shared in-memory API state -> serial
  use: {
    baseURL: LIVE || 'http://localhost:8787',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    headless: true,
    launchOptions: {
      // real GPU in headless (otherwise SwiftShader software rendering
      // makes FPS numbers meaningless as a phone proxy)
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
    }
  },
  webServer: LIVE ? undefined : {
    command: 'npm run build && node server/dev.js --serve-dist',
    port: 8787,
    reuseExistingServer: false,
    timeout: 120000
  }
});
