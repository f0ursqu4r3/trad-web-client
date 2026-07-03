import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('FE terminal holds many live Bybit watch-only trailing entries', async ({ page }) => {
  test.setTimeout(240_000)
  test.skip(
    process.env.BYBIT_LIVE_FE_WATCH_ONLY_SMOKE !== '1',
    'live Bybit watch-only smoke is explicitly gated',
  )

  const accountId = requiredEnv('TRAD_E2E_BYBIT_ACCOUNT_ID')
  const token = requiredEnv('TRAD_E2E_BYBIT_TOKEN')
  const plans = requiredEnv('BYBIT_LIVE_WATCH_ONLY_PLANS')
  const holdMs = process.env.BYBIT_LIVE_WATCH_ONLY_HOLD_MS || '30000'
  const risk = process.env.BYBIT_LIVE_WATCH_ONLY_RISK || '10'

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.route('**/api/accounts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  const params = new URLSearchParams({
    autostart: '1',
    accountId,
    token,
    plans,
    holdMs,
    risk,
  })
  await page.goto(`/e2e/bybit-live-watch-only?${params.toString()}`)

  await page.waitForFunction(
    () => (window as any).__tradBybitLiveWatchOnly?.getState().phase === 'done',
    undefined,
    { timeout: 210_000 },
  )

  const result = await page.evaluate(() => (window as any).__tradBybitLiveWatchOnly?.getState())
  expect(result).toBeTruthy()
  expect(result.phase).toBe('done')
  expect(result.error).toBeNull()
  expect(result.requested).toBeGreaterThanOrEqual(1)
  expect(result.accepted).toBe(result.requested)
  expect(result.cleanupRequested).toBe(result.requested)
  expect(result.orderDeviceCount).toBe(0)
  expect(result.nativeProtectionCount).toBe(0)
  expect(result.inspectedCommandId).toBeTruthy()
  expect(result.inspectedTeDeviceId).toBeTruthy()

  if (process.env.BYBIT_LIVE_FE_WATCH_ONLY_RESULT_PATH) {
    writeFileSync(
      process.env.BYBIT_LIVE_FE_WATCH_ONLY_RESULT_PATH,
      `${JSON.stringify(result, null, 2)}\n`,
    )
  }

  await expect(page.getByTestId('bybit-live-watch-only')).toBeVisible()
  await expect(page.getByTestId('watch-phase')).toHaveText('done')
  await expect(page.locator('.command-row').filter({ hasText: 'Trailing Entry' }).first()).toBeVisible()
  await expect(page.getByText(new RegExp(`Graph of TE: Long ${result.inspectedSymbol}`))).toBeVisible()
  await expect(page.getByText('Device Details')).toBeVisible()
})

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for live Bybit watch-only smoke`)
  }
  return value
}
