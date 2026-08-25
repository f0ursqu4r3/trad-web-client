import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('https://api.hyperliquid.xyz/info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        universe: [
          { name: 'BTC', szDecimals: 5 },
          { name: 'ETH', szDecimals: 4 },
          { name: 'SOL', szDecimals: 2 },
        ],
      }),
    })
  })
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

  const metricLabels = await cards
    .filter({ hasText: 'ETH' })
    .locator('.trade-metrics > div > span')
    .allTextContents()
  expect(metricLabels.map((label) => label.trim())).toEqual([
    'Entry avg',
    'Filled / req.',
    'Managed rem.',
    'P&L · USDC',
    'Risk · USDC',
    'Fees · USDC',
    'Pinned all-in',
  ])
})

test('expands trades into price charts, devices, sequence, and history', async ({ page }) => {
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await eth.locator('.trade-expand').click()

  await expect(eth.getByRole('button', { name: 'Orders & protection' })).toBeVisible()
  await expect(eth.getByRole('cell', { name: 'market', exact: true })).toBeVisible()

  await eth.getByRole('button', { name: 'devices', exact: true }).click()
  await expect(eth.getByTestId('projection-details')).toBeVisible()
  await expect(eth.getByTestId('managed-trade-device-tree').locator('.device-row')).toHaveCount(7)
  await expect(eth.getByText('Native Protection', { exact: true })).toBeVisible()

  await eth.getByRole('button', { name: 'sequence', exact: true }).click()
  await expect(eth.locator('.dag-canvas')).toBeVisible()
  await expect(eth.getByTestId('managed-trade-sequence').locator('.node')).toHaveCount(7)
  await expect(eth.getByTestId('managed-trade-sequence').getByText('Stop Loss')).toBeVisible()

  await eth
    .getByLabel('Trade details')
    .getByRole('button', { name: 'history', exact: true })
    .click()
  await expect(eth.getByText('place order', { exact: true })).toBeVisible()
  await expect(eth.getByText('fill', { exact: true })).toHaveCount(2)

  const sol = page.getByTestId('managed-trade-card').filter({ hasText: 'SOL' })
  await expect(sol.getByTestId('managed-trade-chart')).toBeVisible()
  await sol.locator('.trade-expand').click()
  await sol.getByRole('button', { name: 'chart', exact: true }).click()
  await expect(sol.getByTestId('engine-te-chart')).toBeVisible()
  await expect(sol.getByText('Recent node history · 80 trades')).toBeVisible()
  await expect(sol.locator('canvas')).not.toHaveCount(0)
})

test('trade filters and trade metadata actions survive the trade-centric view', async ({
  page,
}) => {
  const workspace = page.getByTestId('trader-workspace')
  const sol = workspace.getByTestId('managed-trade-card').filter({ hasText: 'SOL' })

  await sol.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Duplicate trade' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Open sequence' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Hide mini chart' }).click()
  await expect(sol.getByTestId('managed-trade-chart')).toHaveCount(0)

  await sol.getByRole('button', { name: 'Trade actions' }).click()
  await page.getByRole('menuitem', { name: 'Pin trade' }).click()
  await expect(workspace.getByTestId('managed-trade-card').first()).toContainText('SOL')

  await sol.getByRole('button', { name: 'Trade actions' }).click()
  await page.getByRole('menuitem', { name: 'Nickname / color…' }).click()
  const rename = page.getByRole('dialog', { name: 'Trade nickname' })
  await rename.getByRole('textbox').fill('Rebound test')
  await rename.getByRole('button', { name: 'Purple' }).click()
  await rename.getByRole('button', { name: 'Save' }).click()
  await expect(sol).toContainText('Rebound test')

  await page.getByTitle('Trade filters').click()
  await page.getByTestId('projection-command-filters').getByRole('button', { name: 'ETH' }).click()
  await expect(workspace.getByTestId('managed-trade-card')).toHaveCount(1)
  await expect(workspace.getByTestId('managed-trade-card').first()).toContainText('ETH')
  await page
    .getByTestId('projection-command-filters')
    .getByRole('button', { name: 'Reset' })
    .click()
  await page.getByPlaceholder('Filter trades').fill('Rebound')
  await expect(workspace.getByTestId('managed-trade-card')).toHaveCount(1)
  await expect(workspace.getByTestId('managed-trade-card').first()).toContainText('SOL')
})

test('duplicate trade loads the workspace ticket instead of the legacy command modal', async ({
  page,
}) => {
  const sol = page.getByTestId('managed-trade-card').filter({ hasText: 'SOL' })
  await sol.getByRole('button', { name: 'Trade actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate trade' }).click()

  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  await expect(
    ticket.getByText('Duplicated trade loaded. Review it before submitting.'),
  ).toBeVisible()
  await expect(ticket.locator('input').first()).toHaveValue('SOL')
  await expect(ticket.getByRole('button', { name: 'Trailing', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('dialog', { name: 'Trailing Entry' })).toHaveCount(0)
})

test('cross-view links select, focus, expand, and scroll to the owning trade', async ({ page }) => {
  const workspace = page.getByTestId('trader-workspace')
  await workspace.locator('.workspace-summaries .order-link').first().click()

  const selected = workspace.locator('.trade-card.selected')
  await expect(selected).toHaveCount(1)
  await expect(selected).toHaveClass(/focused/)
  await expect(selected).toHaveClass(/expanded/)
  expect(
    await workspace
      .locator('.workspace-main')
      .evaluate((element) => getComputedStyle(element).backgroundImage !== 'none'),
  ).toBe(true)
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
  await expect(eth.getByRole('button', { name: 'execution', exact: true })).toBeVisible()
  await expect(eth.getByRole('button', { name: 'log', exact: true })).toHaveCount(0)
  await expect(eth.getByRole('button', { name: 'resync totals', exact: true })).toHaveCount(0)
  await expect(eth.getByRole('button', { name: 'take over', exact: true }).first()).toBeVisible()
  await expect(eth.getByRole('button', { name: 'close all', exact: true }).first()).toBeVisible()

  await history.click()
  await expect(eth.getByText('place order', { exact: true })).toBeVisible()
  await eth.getByRole('button', { name: 'execution', exact: true }).click()
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
  await expect(ticket.locator('.market-price')).toContainText(/63,842.5.*\d+s ago/)
  const livePrice = ticket.locator('.market-price')
  const priceTop = await livePrice
    .locator('.price-value')
    .evaluate((element) => Math.round(element.getBoundingClientRect().top))
  const ageTop = await livePrice
    .locator('.freshness')
    .evaluate((element) => Math.round(element.getBoundingClientRect().top))
  expect(ageTop).toBe(priceTop)
  const stopLoss = ticket.getByLabel('Stop-loss price (USDC)')
  await stopLoss.fill('62000')
  await expect(stopLoss).toHaveValue('62000')
  await expect(ticket.getByText('Ready', { exact: true })).toBeVisible()

  const submit = ticket.getByRole('button', { name: 'Buy BTC chase' })
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(ticket.getByText('Buy BTC chase accepted by Trad.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Chase Order' })).toHaveCount(0)
})

test('market combobox filters the account catalog and completes with the keyboard', async ({
  page,
}) => {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  const market = ticket.getByRole('combobox', { name: /market/i }).first()

  await market.fill('E')
  await expect(page.getByRole('option', { name: /ETH/ })).toBeVisible()
  await market.press('Tab')
  await expect(market).toHaveValue('ETH')
})

test('sets directional stop prices from explicit latest-trade distance presets', async ({
  page,
}) => {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  const stop = ticket.getByLabel('Stop-loss price (USDC)')

  await expect(ticket.getByText('below 63,842.5', { exact: true })).toBeVisible()
  await ticket.getByRole('button', { name: '−5%' }).click()
  await expect(stop).toHaveValue('60650')

  await ticket.getByRole('button', { name: 'Sell / Short' }).click()
  await expect(ticket.getByText('above 63,842.5', { exact: true })).toBeVisible()
  await ticket.getByRole('button', { name: '+2%' }).click()
  await expect(stop).toHaveValue('65120')
})

test('required fields stay neutral until interaction and then identify the correction', async ({
  page,
}) => {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  const stop = ticket.getByLabel('Stop-loss price (USDC)')
  const field = stop.locator('xpath=ancestor::label[contains(@class, "form-field")]')

  await expect(field).toHaveClass(/form-field-required-empty/)
  await expect(field).not.toHaveClass(/form-field-invalid/)
  await stop.focus()
  await stop.blur()
  await expect(field).toHaveClass(/form-field-invalid/)
  await expect(field.getByText('Stop-loss price (USDC) is required')).toBeVisible()
  await expect(stop).toHaveAttribute('aria-invalid', 'true')
})

test('mobile splits ticket and trades, preserves each scroll position, and stays dense', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const workspace = page.getByTestId('trader-workspace')
  const ticketTab = workspace.getByRole('button', { name: 'New trade', exact: true })
  const tradesTab = workspace.getByRole('button', { name: 'Trades', exact: true })
  await expect(tradesTab).toHaveAttribute('aria-pressed', 'true')
  await expect(workspace.getByText('Order ticket')).toBeHidden()

  const btc = workspace.getByTestId('managed-trade-card').filter({ hasText: 'BTC' })
  await expect(btc).toBeVisible()
  const main = workspace.locator('.workspace-main')
  await main.evaluate((element) => (element.scrollTop = 240))
  const tradeScroll = await main.evaluate((element) => element.scrollTop)

  await ticketTab.click()
  await expect(workspace.getByText('Order ticket')).toBeVisible()
  const sidebar = workspace.locator('.workspace-sidebar')
  await sidebar.evaluate((element) => (element.scrollTop = 180))
  const ticketScroll = await sidebar.evaluate((element) => element.scrollTop)

  await tradesTab.click()
  expect(await main.evaluate((element) => element.scrollTop)).toBe(tradeScroll)
  await ticketTab.click()
  expect(await sidebar.evaluate((element) => element.scrollTop)).toBe(ticketScroll)
  expect(
    await workspace.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)
})

test('tablet workspace consumes the full content width without a ghost desktop column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  const workspace = page.getByTestId('trader-workspace')
  const workspaceBox = await workspace.boundingBox()
  const mainBox = await workspace.locator('.workspace-main').boundingBox()
  expect(workspaceBox).not.toBeNull()
  expect(mainBox).not.toBeNull()
  expect(Math.abs(mainBox!.width - workspaceBox!.width)).toBeLessThanOrEqual(1)
})

test('desktop account identity reads with its letter baseline toward the workspace', async ({
  page,
}) => {
  const label = page.getByTestId('account-identity-rail').locator('.account-rail-label').first()
  await expect(label).toHaveCSS('transform', 'matrix(0, -1, 1, 0, 0, 0)')
})

test('phone account identity becomes a horizontal top strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const rail = page.getByTestId('account-identity-rail')
  const box = await rail.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs(box!.width - 390)).toBeLessThanOrEqual(1)
  expect(box!.height).toBe(20)
  expect(
    await rail
      .locator('.account-rail-label')
      .first()
      .evaluate((element) => getComputedStyle(element).writingMode),
  ).toBe('horizontal-tb')
})

test('empty trade states use one continuous workspace grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const workspace = page.getByTestId('trader-workspace')
  await workspace.getByRole('button', { name: 'Closed 0' }).click()
  const empty = workspace.locator('.panel-empty-state')
  await expect(empty.getByText('No closed trades')).toBeVisible()
  expect(await empty.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none')
  expect(
    await workspace
      .locator('.workspace-main')
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).not.toBe('none')
})

test('duplicate switches mobile users to a populated new-trade ticket', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const workspace = page.getByTestId('trader-workspace')
  const sol = workspace.getByTestId('managed-trade-card').filter({ hasText: 'SOL' })
  await sol.getByRole('button', { name: 'Trade actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate trade' }).click()

  await expect(workspace.getByRole('button', { name: 'New trade', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    workspace.getByRole('form', { name: 'New trade order ticket' }).locator('input').first(),
  ).toHaveValue('SOL')
})
