import { defineConfig, devices } from '@playwright/test'

const port = process.env.PLAYWRIGHT_PORT || '4173'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
      },
    },
    // Phone profiles for the network budgets (e2e/network-budgets.spec.ts)
    // and history paging (e2e/history-paging.spec.ts).
    // Playwright can throttle the CPU only in Chromium (CDP), so phone compute
    // is measured on Chromium at 4x with a phone viewport and touch, and
    // WebKit on an iPhone profile runs unthrottled for Safari-engine
    // correctness.
    {
      name: 'phone-chromium-4x',
      testMatch: /(network-budgets|history-paging)\.spec\.ts/,
      metadata: { cpuThrottle: 4 },
      use: {
        ...devices['Pixel 7'],
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL,
      },
    },
    {
      name: 'phone-webkit',
      testMatch: /(network-budgets|history-paging)\.spec\.ts/,
      use: { ...devices['iPhone 14'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/e2e/bybit-terminal`,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      VITE_E2E: '1',
      VITE_WS_URL: process.env.VITE_WS_URL || '',
    },
  },
})
