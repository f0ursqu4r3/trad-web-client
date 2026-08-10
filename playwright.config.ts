import { defineConfig, devices } from '@playwright/test'

const externalTerminalBaseUrl = process.env.ENGINE_PROCESS_TERMINAL_BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: externalTerminalBaseUrl || 'http://127.0.0.1:4173',
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
  ],
  webServer: externalTerminalBaseUrl
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173/e2e/bybit-terminal',
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          VITE_E2E: '1',
          VITE_WS_URL: process.env.VITE_WS_URL || '',
        },
      },
})
