import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('FE terminal drives many live Bybit trailing entries and closes', async ({ page }) => {
  test.skip(
    process.env.BYBIT_LIVE_FE_BULK_TE_SMOKE !== '1',
    'live Bybit bulk TE smoke is explicitly gated',
  )

  const accountId = requiredEnv('TRAD_E2E_BYBIT_ACCOUNT_ID')
  const token = requiredEnv('TRAD_E2E_BYBIT_TOKEN')
  const plans = requiredEnv('BYBIT_LIVE_BULK_TE_PLANS')
  const risk = process.env.BYBIT_LIVE_BULK_TE_RISK || '1'
  const openWaitMs = process.env.BYBIT_LIVE_BULK_TE_OPEN_WAIT_MS || '300000'
  const closeWaitMs = process.env.BYBIT_LIVE_BULK_TE_CLOSE_WAIT_MS || '300000'
  const minOpenCount = process.env.BYBIT_LIVE_BULK_TE_MIN_OPEN_COUNT || ''
  const activationFrac = process.env.BYBIT_LIVE_BULK_TE_ACTIVATION_FRAC || '0.001'
  const stopLossFrac = process.env.BYBIT_LIVE_BULK_TE_STOP_LOSS_FRAC || '0.05'
  const takeProfitFrac = process.env.BYBIT_LIVE_BULK_TE_TAKE_PROFIT_FRAC || '0.02'
  const jumpFracThreshold = process.env.BYBIT_LIVE_BULK_TE_JUMP_FRAC_THRESHOLD || '0.001'
  const controlledTrigger = process.env.BYBIT_LIVE_BULK_TE_CONTROLLED_TRIGGER === '1' ? '1' : ''
  const waitBudgetMs = Number(openWaitMs) + Number(closeWaitMs) + 240_000
  test.setTimeout(Math.max(900_000, waitBudgetMs + 60_000))

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
    risk,
    openWaitMs,
    closeWaitMs,
    ...(minOpenCount ? { minOpenCount } : {}),
    activationFrac,
    stopLossFrac,
    takeProfitFrac,
    jumpFracThreshold,
    ...(controlledTrigger ? { controlledTrigger } : {}),
  })
  await page.goto(`/e2e/bybit-live-bulk-te?${params.toString()}`)

  let waitError: unknown = null
  try {
    await page.waitForFunction(
      () => {
        const phase = (window as any).__tradBybitLiveBulkTe?.getState().phase
        return phase === 'closed' || phase === 'failed'
      },
      undefined,
      { timeout: waitBudgetMs },
    )
  } catch (err) {
    waitError = err
  }

  const result = await page.evaluate(() => (window as any).__tradBybitLiveBulkTe?.getState())
  expect(result).toBeTruthy()
  if (process.env.BYBIT_LIVE_FE_BULK_TE_RESULT_PATH) {
    writeFileSync(
      process.env.BYBIT_LIVE_FE_BULK_TE_RESULT_PATH,
      `${JSON.stringify(result, null, 2)}\n`,
    )
  }

  expect(waitError, JSON.stringify(result, null, 2)).toBeNull()
  expect(result.phase).toBe('closed')
  expect(result.error).toBeNull()
  expect(result.requested).toBeGreaterThanOrEqual(1)
  expect(result.accepted).toBe(result.requested)
  expect(result.minOpenCount).toBeGreaterThanOrEqual(1)
  expect(result.openFilled).toBeGreaterThanOrEqual(result.minOpenCount)
  expect(result.openFilled).toBeLessThanOrEqual(result.requested)
  expect(result.closeRequested).toBe(result.openFilled)
  expect(result.closeFilled).toBe(result.closeRequested)
  expect(result.nativeProtectionCount).toBeGreaterThanOrEqual(result.openFilled)
  expect(result.inspectedCommandId).toBeTruthy()
  expect(result.inspectedTeDeviceId).toBeTruthy()

  await expect(page.getByTestId('bybit-live-bulk-te')).toBeVisible()
  await expect(page.getByTestId('bulk-phase')).toHaveText('closed')
  await expect(page.getByTestId('bulk-error')).toHaveText('-')
  await expect(page.getByTestId('bulk-queue')).toContainText('0 queued / 0 live')
  await expect(page.locator('.command-row').filter({ hasText: 'Trailing Entry' }).first()).toBeVisible()
})

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for live Bybit bulk TE smoke`)
  }
  return value
}
