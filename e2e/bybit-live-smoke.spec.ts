import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('FE websocket drives a tiny live Bybit trailing entry and close', async ({ page }) => {
  test.setTimeout(300_000)
  test.skip(process.env.BYBIT_LIVE_FE_SMOKE !== '1', 'live Bybit smoke is explicitly gated')

  const accountId = requiredEnv('TRAD_E2E_BYBIT_ACCOUNT_ID')
  const token = requiredEnv('TRAD_E2E_BYBIT_TOKEN')
  const price = requiredEnv('BYBIT_LIVE_PRICE')
  const symbol = process.env.BYBIT_LIVE_SYMBOL || 'BTCUSDT'
  const risk = process.env.BYBIT_LIVE_RISK || '1.5'

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  const params = new URLSearchParams({
    autostart: '1',
    accountId,
    token,
    symbol,
    price,
    risk,
  })
  await page.goto(`/e2e/bybit-live-smoke?${params.toString()}`)

  await page.waitForFunction(
    () => (window as any).__tradBybitLiveSmoke?.getState().phase === 'closed',
    undefined,
    { timeout: 240_000 },
  )

  const result = await page.evaluate(() => (window as any).__tradBybitLiveSmoke?.getState())
  expect(result).toBeTruthy()
  expect(result?.phase).toBe('closed')
  expect(result?.teCommandId).toBeTruthy()
  expect(result?.closeCommandId).toBeTruthy()
  expect(result?.error).toBeNull()

  if (process.env.BYBIT_LIVE_FE_SMOKE_RESULT_PATH) {
    writeFileSync(
      process.env.BYBIT_LIVE_FE_SMOKE_RESULT_PATH,
      `${JSON.stringify(result, null, 2)}\n`,
    )
  }
})

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for live Bybit FE smoke`)
  }
  return value
}
