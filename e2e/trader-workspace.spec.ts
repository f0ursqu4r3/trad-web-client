import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
  await page.goto('/e2e/trader-workspace')
})

test('presents managed trades instead of a primary command list', async ({ page }) => {
  const workspace = page.getByTestId('trader-workspace')
  const cards = workspace.getByTestId('managed-trade-card')

  await expect(cards).toHaveCount(3)
  await expect(cards.filter({ hasText: 'BTC' })).toContainText('active')
  await expect(cards.filter({ hasText: 'SOL' })).toContainText('entering')
  await expect(cards.filter({ hasText: 'ETH' })).toContainText('SL 1,800.125')
  await expect(cards.filter({ hasText: 'ETH' })).toContainText('1 TP')
  await expect(workspace.getByText('outside Trad')).toBeVisible()
})

test('expands one trade into orders, devices, graph, and history', async ({ page }) => {
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await eth.locator('.trade-expand').click()

  await expect(eth.getByRole('button', { name: 'Orders & protection' })).toBeVisible()
  await expect(eth.getByRole('cell', { name: 'market', exact: true })).toBeVisible()

  await eth.getByRole('button', { name: 'devices', exact: true }).click()
  await expect(eth.getByTestId('projection-details')).toBeVisible()

  await eth.getByRole('button', { name: 'graph', exact: true }).click()
  await expect(eth.locator('.dag-canvas')).toBeVisible()

  await eth.getByRole('button', { name: 'history', exact: true }).click()
  await expect(eth.getByText('place order', { exact: true })).toBeVisible()
  await expect(eth.getByText('fill', { exact: true })).toBeVisible()
})

test('close presets remain ordinary audited close commands', async ({ page }) => {
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await eth.getByRole('button', { name: 'Close ½' }).click()

  const dialog = page.getByRole('dialog', { name: 'Close Exposure' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Close Amount')).toHaveValue('percent')
  await expect(dialog.getByLabel('Close Percentage (%)')).toHaveValue('50')
})

test('compact ticket opens the complete existing command form with prefill', async ({ page }) => {
  await page.getByRole('button', { name: /review chase/i }).click()

  const dialog = page.getByRole('dialog', { name: 'Chase Order' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Symbol')).toHaveValue('BTC')
  await expect(dialog.getByLabel('SL Trigger')).toBeVisible()
})

test('mobile stacks ticket, trades, then venue summaries without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const workspace = page.getByTestId('trader-workspace')
  await expect(workspace.getByText('Order ticket')).toBeVisible()

  const btc = workspace.getByTestId('managed-trade-card').filter({ hasText: 'BTC' })
  await btc.scrollIntoViewIfNeeded()
  await expect(btc).toBeVisible()
  expect(
    await workspace.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)
})
