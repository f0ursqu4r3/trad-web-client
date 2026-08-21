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

  await expect(
    page.getByRole('button', { name: /switch trading account: krio demo/i }),
  ).toBeVisible()
  await expect(page.getByTestId('account-identity-rail')).toContainText(/Krio demo/i)
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
  await expect(eth.getByTestId('managed-trade-device-tree').locator('.device-row')).toHaveCount(7)
  await expect(eth.getByText('Native Protection', { exact: true })).toBeVisible()

  await eth.getByRole('button', { name: 'graph', exact: true }).click()
  await expect(eth.locator('.dag-canvas')).toBeVisible()
  await expect(eth.getByTestId('managed-trade-graph').locator('.node')).toHaveCount(7)
  await expect(eth.getByTestId('managed-trade-graph').getByText('Stop Loss')).toBeVisible()

  await eth
    .getByLabel('Trade details')
    .getByRole('button', { name: 'history', exact: true })
    .click()
  await expect(eth.getByText('place order', { exact: true })).toBeVisible()
  await expect(eth.getByText('fill', { exact: true })).toHaveCount(2)
})

test('mirrors the client workflow with practical presets and redundant trade actions', async ({
  page,
}) => {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  await expect(ticket.getByText('Managed trade', { exact: true })).toHaveCount(0)
  await ticket.getByRole('button', { name: 'Size by risk' }).click()
  await expect(ticket.getByRole('button', { name: '10,000 USDC' })).toBeVisible()
  await expect(ticket.getByRole('button', { name: '5,000 USDC' })).toBeVisible()
  await expect(ticket.getByRole('button', { name: '2,500 USDC' })).toBeVisible()

  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  const history = eth.getByRole('button', { name: 'history', exact: true }).first()
  await expect(history).toBeVisible()
  await expect(eth.getByRole('button', { name: 'log', exact: true })).toBeVisible()
  await expect(eth.getByRole('button', { name: 'resync totals', exact: true })).toBeVisible()
  await expect(eth.getByRole('button', { name: 'take over', exact: true }).first()).toBeVisible()
  await expect(eth.getByRole('button', { name: 'close all', exact: true }).first()).toBeVisible()

  await history.click()
  await expect(eth.getByText('place order', { exact: true })).toBeVisible()
  await eth.getByRole('button', { name: 'log', exact: true }).click()
  await expect(eth.getByTestId('projection-details')).toBeVisible()

  await eth.getByRole('button', { name: 'close all', exact: true }).first().click()
  const closeDialog = page.getByRole('dialog', { name: 'Close Exposure' })
  await expect(closeDialog).toBeVisible()
  await closeDialog.getByRole('button', { name: 'Back' }).click()

  await eth.getByRole('button', { name: 'move', exact: true }).first().click()
  const modal = page.getByRole('dialog', { name: 'Edit Native Protection' })
  await expect(modal).toBeVisible()
  await expect(modal.getByLabel('TP 1 Trigger')).toBeFocused()
})

test('close presets remain ordinary audited close commands', async ({ page }) => {
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await eth.getByRole('button', { name: 'Close ½' }).click()

  const dialog = page.getByRole('dialog', { name: 'Close Exposure' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Close Amount')).toHaveValue('percent')
  await expect(dialog.getByLabel('Close Percentage (%)')).toHaveValue('50')
})

test('complete inline ticket previews and submits without opening the legacy form', async ({
  page,
}) => {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })

  await expect(ticket.getByText('Join top · post-only maker')).toBeVisible()
  await expect(ticket.getByText(/Live trade 63,842.5 USDC/)).toBeVisible()
  await ticket.getByLabel('Stop-loss price (USDC)').fill('62000')
  await expect(ticket.getByText('Ready', { exact: true })).toBeVisible()

  const submit = ticket.getByRole('button', { name: 'Buy BTC chase' })
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(ticket.getByText('Buy BTC chase accepted by Trad.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Chase Order' })).toHaveCount(0)
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
