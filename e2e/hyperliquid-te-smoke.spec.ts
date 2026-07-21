import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('FE terminal drives Hyperliquid TE through debug-triggered e2e flow', async ({ page }) => {
  test.setTimeout(180_000)
  test.skip(
    process.env.HYPERLIQUID_FE_TE_SMOKE !== '1',
    'Hyperliquid TE smoke is explicitly gated',
  )

  const accountId = requiredEnv('TRAD_E2E_HYPERLIQUID_ACCOUNT_ID')
  const token = requiredEnv('TRAD_E2E_HYPERLIQUID_TOKEN')
  const price = requiredEnv('HYPERLIQUID_FE_TE_PRICE')
  const symbol = process.env.HYPERLIQUID_FE_TE_SYMBOL || 'BTC'
  const network = process.env.TRAD_E2E_HYPERLIQUID_NETWORK || 'testnet'
  const risk = process.env.HYPERLIQUID_FE_TE_RISK || '1'
  const tick = process.env.HYPERLIQUID_FE_TE_TICK || '1'

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
    network,
    symbol,
    price,
    risk,
    tick,
  })
  await page.goto(`/e2e/hyperliquid-te-smoke?${params.toString()}`)

  await page.waitForFunction(
    () => ['closed', 'failed'].includes((window as any).__tradHyperliquidTeSmoke?.getState().phase),
    undefined,
    { timeout: 170_000 },
  )

  const result = await page.evaluate(() => (window as any).__tradHyperliquidTeSmoke?.getState())
  expect(result).toBeTruthy()
  expect(result.phase, JSON.stringify(result, null, 2)).toBe('closed')
  expect(result.error).toBeNull()
  expect(result.teCommandId).toBeTruthy()
  expect(result.injectionCommandId).toBeTruthy()
  expect(result.openDeviceId).toBeTruthy()
  expect(result.nativeProtectionSeen).toBe(true)
  expect(result.closeDeviceId).toBeTruthy()

  if (process.env.HYPERLIQUID_FE_TE_RESULT_PATH) {
    writeFileSync(process.env.HYPERLIQUID_FE_TE_RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`)
  }

  await expect(page.getByTestId('hyperliquid-te-smoke')).toBeVisible()
  await expect(page.getByTestId('smoke-phase')).toHaveText('closed')
  await expect(page.getByTestId('smoke-error')).toHaveText('-')
})

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for Hyperliquid TE smoke`)
  }
  return value
}
