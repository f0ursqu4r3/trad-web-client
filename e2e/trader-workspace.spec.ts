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
  await expect(workspace.getByRole('button', { name: 'All 3', exact: true })).toBeVisible()
  await expect(cards.locator('time')).toHaveCount(3)
  const ethTradeId = cards
    .filter({ hasText: 'ETH' })
    .getByRole('button', { name: 'Copy trade ID 30000000-0000-4000-8000-000000000001' })
  await expect(ethTradeId).toHaveText('#30000000')
  await expect(ethTradeId).toHaveAttribute(
    'title',
    'Copy full trade ID 30000000-0000-4000-8000-000000000001',
  )

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
  await expect(cards.filter({ hasText: 'ETH' }).locator('.metric-pnl')).toContainText('Net')
  await expect(cards.filter({ hasText: 'ETH' }).locator('.metric-pnl')).toContainText('Live')
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

test('telemetry correlates modal abandonment and accepted command flow without raw inputs', async ({
  page,
}) => {
  const batches: Array<{ events: Array<Record<string, unknown>> }> = []
  await page.route('**/api/telemetry/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 1,
        collection_enabled: true,
        max_batch_bytes: 64 * 1024,
        max_events_per_batch: 32,
        flush_interval_ms: 1_000,
        queue_capacity: 128,
        max_event_age_ms: 120_000,
      }),
    })
  })
  await page.route('**/api/telemetry/events', async (route) => {
    const batch = route.request().postDataJSON()
    batches.push(batch)
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        collection_enabled: true,
        accepted: batch.events.length,
        duplicate: 0,
        invalid: 0,
        dropped: 0,
        sequence_gaps: 0,
      }),
    })
  })
  await page.reload()

  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await eth.getByRole('button', { name: 'Close ½' }).click()
  await page
    .getByRole('dialog', { name: 'Close Exposure' })
    .getByRole('button', { name: 'Back' })
    .click()

  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  await ticket.getByLabel('Stop-loss price (USDC)').fill('62000')
  await expect(ticket.getByText('Ready', { exact: true })).toBeVisible()
  await ticket.getByRole('button', { name: 'Buy BTC chase' }).click()
  await expect(ticket.getByText('Buy BTC chase accepted by Trad.')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect
    .poll(() => hasCorrelatedEvent(batches, 'place_chase', 'durable_command_linked'))
    .toBe(true)

  const events = batches.flatMap((batch) => batch.events)
  expect(
    events
      .filter((event) => event.trade_id !== undefined)
      .every(
        (event) =>
          typeof event.trade_id === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            event.trade_id,
          ),
      ),
  ).toBe(true)
  const canceled = events.find((event) => event.event_name === 'action_canceled')
  expect(canceled?.action_attempt_id).toBeTruthy()
  expect(
    events.some(
      (event) =>
        event.event_name === 'action_opened' &&
        event.action_attempt_id === canceled?.action_attempt_id,
    ),
  ).toBe(true)

  const confirmed = events.find(
    (event) =>
      event.event_name === 'action_confirmed' &&
      (event.properties as { action_kind?: string }).action_kind === 'place_chase',
  )
  expect(confirmed?.action_attempt_id).toBeTruthy()
  const correlated = events
    .filter((event) => event.action_attempt_id === confirmed?.action_attempt_id)
    .map((event) => event.event_name)
  expect(correlated).toEqual(
    expect.arrayContaining([
      'preview_requested',
      'request_queued',
      'request_sent',
      'response_received',
      'action_confirmed',
      'action_submitted',
      'action_accepted',
      'command_route_accepted',
      'durable_command_linked',
    ]),
  )
  expect(JSON.stringify(events)).not.toContain('62000')
})

test('reconciliation-blocked protection edit explains intent without sending a command', async ({
  page,
}) => {
  const batches: Array<{ events: Array<Record<string, unknown>> }> = []
  await page.route('**/api/telemetry/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 1,
        collection_enabled: true,
        max_batch_bytes: 64 * 1024,
        max_events_per_batch: 32,
        flush_interval_ms: 1_000,
        queue_capacity: 128,
        max_event_age_ms: 120_000,
      }),
    })
  })
  await page.route('**/api/telemetry/events', async (route) => {
    const batch = route.request().postDataJSON()
    batches.push(batch)
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        collection_enabled: true,
        accepted: batch.events.length,
        duplicate: 0,
        invalid: 0,
        dropped: 0,
        sequence_gaps: 0,
      }),
    })
  })
  await page.goto('/e2e/trader-workspace?reconciliation=1')

  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await eth.getByRole('button', { name: 'Edit protection' }).click({ force: true })
  await expect(eth.getByText(/needs reconciliation before Trad can safely change/i)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Edit Native Protection' })).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect
    .poll(() =>
      batches
        .flatMap((batch) => batch.events)
        .some(
          (event) =>
            event.event_name === 'action_blocked' &&
            (event.properties as { action_kind?: string; blocker_code?: string }).action_kind ===
              'edit_protection' &&
            (event.properties as { blocker_code?: string }).blocker_code ===
              'RECONCILIATION_REQUIRED',
        ),
    )
    .toBe(true)
  const events = batches.flatMap((batch) => batch.events)
  const blocked = events.find(
    (event) =>
      event.event_name === 'action_blocked' &&
      (event.properties as { action_kind?: string }).action_kind === 'edit_protection',
  )
  expect(
    events.some(
      (event) =>
        event.event_name === 'action_submitted' &&
        event.action_attempt_id === blocked?.action_attempt_id,
    ),
  ).toBe(false)
})

function hasCorrelatedEvent(
  batches: Array<{ events: Array<Record<string, unknown>> }>,
  actionKind: string,
  expectedName: string,
): boolean {
  const events = batches.flatMap((batch) => batch.events)
  const confirmed = events.find(
    (event) =>
      event.event_name === 'action_confirmed' &&
      (event.properties as { action_kind?: string }).action_kind === actionKind,
  )
  return events.some(
    (event) =>
      event.event_name === expectedName && event.action_attempt_id === confirmed?.action_attempt_id,
  )
}

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

test('offers exact latest-trade distance controls for activation and take profit', async ({
  page,
}) => {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  await ticket.getByRole('button', { name: 'Trailing', exact: true }).click()

  const activation = ticket.getByLabel('Activation price (USDC)')
  const activationField = activation.locator('xpath=ancestor::label[contains(@class, "form-field")]')
  await activationField.getByRole('button', { name: '+2%' }).click()
  await expect(activation).toHaveValue('65120')
  await expect(activationField.getByText(/current \+2%/)).toBeVisible()

  await ticket.getByRole('button', { name: /Add TP/ }).click()
  const takeProfit = ticket.getByLabel('Take-profit 1 (USDC)')
  const takeProfitField = takeProfit.locator(
    'xpath=ancestor::label[contains(@class, "form-field")]',
  )
  await takeProfitField.getByRole('button', { name: '+5%' }).click()
  await expect(takeProfit).toHaveValue('67035')
  await expect(takeProfitField.getByText(/current \+5%/)).toBeVisible()
})

test('warns about likely insufficient margin without disabling submission', async ({ page }) => {
  await page.goto('/e2e/trader-workspace?low_margin=1')
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  await ticket.getByLabel('Stop-loss price (USDC)').fill('62000')

  await expect(ticket.getByText('Likely above available margin')).toBeVisible()
  await expect(
    ticket.getByText(/latest synced 10 available at 1x supports about 10 notional/i),
  ).toBeVisible()
  await expect(ticket.getByRole('button', { name: 'Buy BTC chase' })).toBeEnabled()
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
