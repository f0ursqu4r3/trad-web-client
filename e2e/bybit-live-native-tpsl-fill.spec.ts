import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('FE terminal renders live Bybit native TP/SL exchange fill', async ({ page }) => {
  test.setTimeout(360_000)
  test.skip(
    process.env.BYBIT_LIVE_FE_NATIVE_TPSL_SMOKE !== '1',
    'live Bybit native TP/SL fill smoke is explicitly gated',
  )

  const accountId = requiredEnv('TRAD_E2E_BYBIT_ACCOUNT_ID')
  const token = requiredEnv('TRAD_E2E_BYBIT_TOKEN')
  const symbol = process.env.BYBIT_LIVE_NATIVE_TPSL_SYMBOL || 'ADAUSDT'
  const price = requiredEnv('BYBIT_LIVE_NATIVE_TPSL_PRICE')
  const quantityUsd = process.env.BYBIT_LIVE_NATIVE_TPSL_QUANTITY_USD || '6.5'
  const trigger = process.env.BYBIT_LIVE_NATIVE_TPSL_TRIGGER || 'sl'
  const triggerFrac = process.env.BYBIT_LIVE_NATIVE_TPSL_TRIGGER_FRAC || '0.0006'
  const farExitFrac = process.env.BYBIT_LIVE_NATIVE_TPSL_FAR_EXIT_FRAC || '0.02'
  const tick = process.env.BYBIT_LIVE_NATIVE_TPSL_TICK || '0.0001'
  const fillWaitMs = process.env.BYBIT_LIVE_NATIVE_TPSL_FILL_WAIT_MS || '240000'

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
    quantityUsd,
    trigger,
    triggerFrac,
    farExitFrac,
    tick,
    fillWaitMs,
  })
  await page.goto(`/e2e/bybit-live-native-tpsl-fill?${params.toString()}`)

  await page.waitForFunction(
    () => {
      const phase = (window as any).__tradBybitLiveNativeTpslFill?.getState().phase
      return phase === 'done' || phase === 'failed'
    },
    undefined,
    { timeout: 330_000 },
  )

  const result = await page.evaluate(() =>
    (window as any).__tradBybitLiveNativeTpslFill?.getState(),
  )
  if (process.env.BYBIT_LIVE_FE_NATIVE_TPSL_RESULT_PATH) {
    writeFileSync(
      process.env.BYBIT_LIVE_FE_NATIVE_TPSL_RESULT_PATH,
      `${JSON.stringify(result, null, 2)}\n`,
    )
  }
  expect(result).toBeTruthy()
  expect(result?.phase).toBe('done')
  expect(result?.commandId).toBeTruthy()
  expect(result?.openDeviceId).toBeTruthy()
  expect(result?.nativeProtectionDeviceId).toBeTruthy()
  expect(result?.nativeProtectionStatus).toBe('Flat')
  expect(result?.protectionFilledQty).toBeGreaterThan(0)
  expect(result?.lastOrderReason).toMatch(/Exchange .* filled/)
  expect(result?.error).toBeNull()

  const shell = page.getByTestId('bybit-live-native-tpsl-fill')
  await expect(shell).toBeVisible()
  await expect(page.getByTestId('smoke-phase')).toHaveText('done')
  await expect(shell.getByRole('heading', { name: 'Native Protection' })).toBeVisible()
  await expect(shell.getByText('Flat').first()).toBeVisible()
  await expect(shell.getByText(result!.lastOrderReason).first()).toBeVisible()
  await expect(shell.getByText('Protection Filled').first()).toBeVisible()
})

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for live Bybit native TP/SL fill smoke`)
  }
  return value
}
