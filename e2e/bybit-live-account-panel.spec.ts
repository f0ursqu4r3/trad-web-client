import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('FE account panel reads live Bybit leverage and throttle state', async ({ page }) => {
  test.setTimeout(120_000)
  test.skip(
    process.env.BYBIT_LIVE_FE_ACCOUNT_PANEL_SMOKE !== '1',
    'live Bybit account-panel smoke is explicitly gated',
  )

  const accountId = requiredEnv('TRAD_E2E_BYBIT_ACCOUNT_ID')
  const token = requiredEnv('TRAD_E2E_BYBIT_TOKEN')
  const symbol = process.env.BYBIT_LIVE_ACCOUNT_PANEL_SYMBOL || 'DOGEUSDT'

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
    symbol,
  })
  await page.goto(`/e2e/bybit-live-account-panel?${params.toString()}`)

  await page.waitForFunction(
    () => (window as any).__tradBybitLiveAccountPanel?.getState().phase === 'ready',
    undefined,
    { timeout: 90_000 },
  )

  let result = await page.evaluate(() => (window as any).__tradBybitLiveAccountPanel?.getState())
  expect(result).toBeTruthy()
  expect(result?.phase).toBe('ready')
  expect(result?.error).toBeNull()

  const accountPanel = page.getByTestId('accounts-panel')
  await expect(accountPanel.getByText('Bybit Live Account Panel')).toBeVisible()
  await expect(accountPanel.getByText('Current Lev:')).toBeVisible()
  await accountPanel.locator('input').first().fill(symbol)
  await accountPanel.getByRole('button', { name: 'Check Lev' }).click()
  await expect(accountPanel.getByText(new RegExp(`${symbol} L/S`))).toBeVisible()
  result = await page.evaluate(() => (window as any).__tradBybitLiveAccountPanel?.getState())
  expect(
    result?.leverage?.leverages?.some((item: { symbol?: string }) => item.symbol === symbol),
  ).toBe(true)
  await expect(accountPanel.getByText('Queue', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('0 queued / 0 live')).toBeVisible()
  await expect(accountPanel.getByText('Bybit Remain', { exact: true })).toBeVisible()

  if (process.env.BYBIT_LIVE_FE_ACCOUNT_PANEL_RESULT_PATH) {
    writeFileSync(
      process.env.BYBIT_LIVE_FE_ACCOUNT_PANEL_RESULT_PATH,
      `${JSON.stringify(result, null, 2)}\n`,
    )
  }
})

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required for live Bybit FE account-panel smoke`)
  }
  return value
}
