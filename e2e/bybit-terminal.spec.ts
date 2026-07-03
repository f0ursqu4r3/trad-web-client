import { expect, test } from '@playwright/test'

test('Bybit command and device filters are explicit, not selected-account scoped', async ({
  page,
}) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const commandPanel = page.getByTestId('command-panel')
  const devicePanel = page.getByTestId('device-tree-panel')
  const deviceRows = devicePanel.locator('.device-row')

  await expect(commandPanel.getByText('Bybit BTC native TP/SL')).toBeVisible()
  await expect(commandPanel.getByText('Binance ETH legacy')).toBeVisible()
  await expect(devicePanel.getByText('Native Protection')).toBeVisible()
  await expect(devicePanel.getByText('Market Order')).toBeVisible()

  await commandPanel.getByRole('button', { name: 'Bybit', exact: true }).click()

  await expect(commandPanel.getByText('Bybit BTC native TP/SL')).toBeVisible()
  await expect(commandPanel.getByText('Binance ETH legacy')).toHaveCount(0)

  await commandPanel.getByRole('button', { name: 'Bybit', exact: true }).click()
  await expect(commandPanel.getByText('Binance ETH legacy')).toBeVisible()

  await devicePanel.getByRole('button', { name: 'Bybit', exact: true }).click()

  await expect(deviceRows.filter({ hasText: 'Native Protection' })).toBeVisible()
  await expect(deviceRows.filter({ hasText: 'Bybit' })).toBeVisible()
  await expect(deviceRows.filter({ hasText: 'Binance' })).toHaveCount(0)
})

test('Bybit account panel renders order queue telemetry', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const accountPanel = page.getByTestId('accounts-panel')

  await expect(accountPanel.getByText('Bybit QA')).toBeVisible()
  await expect(accountPanel.getByText('20 queued / 5 live')).toBeVisible()
  await expect(accountPanel.getByText('8.5s')).toBeVisible()
  await expect(accountPanel.getByText('4.0s')).toBeVisible()
  await expect(accountPanel.getByText('2 err / 3 cancel')).toBeVisible()
  await expect(accountPanel.getByText('1', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('4', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('16', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('7/10')).toBeVisible()
})
