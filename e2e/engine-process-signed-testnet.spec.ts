import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const enabled = process.env.ENGINE_PROCESS_SIGNED_TESTNET_E2E === '1'
const terminalBaseUrl = process.env.ENGINE_PROCESS_TERMINAL_BASE_URL || 'http://127.0.0.1:15173'
const testEmail = process.env.ENGINE_PROCESS_TEST_EMAIL || 'replacement-qualification@trad.local'
const accountLabel = process.env.ENGINE_PROCESS_ACCOUNT_LABEL || 'replacement-hl-testnet'
const walletAddress =
  process.env.ENGINE_PROCESS_WALLET_ADDRESS || '0x7d6cabebf3ab638ee10e0eabe671bfcfb8336dc3'
const symbol = process.env.ENGINE_PROCESS_SYMBOL || 'BTC'
const notional = process.env.ENGINE_PROCESS_NOTIONAL || '12'
const commandTimeoutMs = Number(process.env.ENGINE_PROCESS_COMMAND_TIMEOUT_MS || '90000')

test.describe.serial('replacement engine through the production terminal', () => {
  test.skip(!enabled, 'signed replacement-process qualification is explicitly gated')

  test('places and flattens a Hyperliquid Testnet market order', async ({ page, request }) => {
    test.setTimeout(4 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let exposurePossible = false
    try {
      await loginAndSelectAccount(page)

      const openId = await submitMarketOpen(page)
      exposurePossible = true
      await expectCommandLifecycle(page, openId, 'succeeded')
      await expectProjectedFilledOrder(page, openId)
      await expectExchangePosition(request)

      const flattenId = await submitSymbolFlatten(page)
      await expectCommandLifecycle(page, flattenId, 'succeeded')
      await expectExchangeFlat(request)
      exposurePossible = false

      await page.screenshot({
        path: 'test-results/engine-process-signed-testnet.png',
        fullPage: true,
      })
    } finally {
      if (exposurePossible) await bestEffortFlatten(page)
      await expectExchangeFlat(request)
    }
  })

  test('installs and tears down native protection from a market fill', async ({
    page,
    request,
  }) => {
    test.setTimeout(4 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let exposurePossible = false
    try {
      await loginAndSelectAccount(page)
      const mid = await hyperliquidMid(request)

      const openId = await submitMarketOpen(page, {
        takeProfit: (mid * 1.05).toFixed(0),
        stopLoss: (mid * 0.95).toFixed(0),
      })
      exposurePossible = true
      await expectCommandLifecycle(page, openId, 'succeeded')
      await expectProjectedFilledOrder(page, openId)
      await expectProjectedProtection(page)
      await expectExchangeProtectedPosition(request)

      const flattenId = await submitSymbolFlatten(page)
      await expectCommandLifecycle(page, flattenId, 'succeeded')
      await expectExchangeFlat(request)
      exposurePossible = false
    } finally {
      if (exposurePossible) await bestEffortFlatten(page)
      await expectExchangeFlat(request)
    }
  })

  test('places and cancels a resting Hyperliquid Testnet limit order', async ({
    page,
    request,
  }) => {
    test.setTimeout(4 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let orderMayBeWorking = false
    try {
      await loginAndSelectAccount(page)
      const mid = await hyperliquidMid(request)
      const commandId = await submitLimitOpen(page, (mid * 0.5).toFixed(0))
      orderMayBeWorking = true
      await expectCommandLifecycle(page, commandId, 'running')
      const order = await selectProjectedOrder(page, commandId)
      await expect(order).toContainText(/working/i, { timeout: commandTimeoutMs })
      await expectExchangeRestingOrder(request)

      await cancelSelectedOrder(page)
      await expect(order).toContainText(/canceled/i, { timeout: commandTimeoutMs })
      await expectExchangeFlat(request)
      orderMayBeWorking = false
    } finally {
      if (orderMayBeWorking) await bestEffortCancelSelectedOrder(page)
      await expectExchangeFlat(request)
    }
  })
})

function validateConfiguration(): void {
  const parsedNotional = Number(notional)
  if (!Number.isFinite(parsedNotional) || parsedNotional < 10 || parsedNotional > 25) {
    throw new Error('ENGINE_PROCESS_NOTIONAL must be between 10 and 25 USDC')
  }
  if (!/^0x[0-9a-f]{40}$/i.test(walletAddress)) {
    throw new Error('ENGINE_PROCESS_WALLET_ADDRESS must be a Hyperliquid user address')
  }
}

async function loginAndSelectAccount(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 })
  const login = new URL('/auth/test-login', terminalBaseUrl)
  login.searchParams.set('email', testEmail)
  login.searchParams.set('return_to', '/terminal')
  await page.goto(login.toString())
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 })
  await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', { timeout: 30_000 })

  const account = page.locator('.account-trigger')
  await expect(account).toContainText(accountLabel, { timeout: 30_000 })
  await expect(account).toContainText(/HYPERLIQUID/i)
  await expect(account).toContainText(/TESTNET/i)
  await expect(account).toContainText(/AGENT APPROVED/i)
  await expect(account).toContainText(/BUILDER APPROVED/i)
  await expect(page.getByTestId('projection-command-list')).toBeVisible()
}

async function submitMarketOpen(
  page: Page,
  protection?: { takeProfit: string; stopLoss: string },
): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'mo', 'Market Order')
  const dialog = page.getByRole('dialog', { name: 'Market Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByLabel('Amount Type').selectOption('quote_notional')
  await dialog.getByLabel('Quote Amount').fill(notional)
  await dialog.getByLabel('Execution Shape').selectOption('single')
  if (protection !== undefined) {
    await dialog.getByRole('button', { name: /Take Profit/i }).click()
    await dialog.getByRole('textbox', { name: 'TP 1 Trigger' }).fill(protection.takeProfit)
    await dialog.getByRole('checkbox', { name: 'Stop loss' }).check()
    await dialog.getByRole('textbox', { name: 'SL Trigger' }).fill(protection.stopLoss)
  }
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Submit' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return await waitForNewCommandId(page, prior)
}

async function submitSymbolFlatten(page: Page): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'fl', 'Flatten Exposure')
  const dialog = page.getByRole('dialog', { name: 'Flatten Exposure' })
  await dialog.getByRole('combobox', { name: /Target/ }).selectOption('symbol')
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByRole('checkbox', { name: /Confirm flatten this symbol/i }).check()
  await expect(dialog.getByRole('button', { name: 'Flatten' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Flatten' }).click()
  return await waitForNewCommandId(page, prior)
}

async function submitLimitOpen(page: Page, limitPrice: string): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'lo', 'Limit Order')
  const dialog = page.getByRole('dialog', { name: 'Limit Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByLabel('Amount Type').selectOption('quote_notional')
  await dialog.getByLabel('Quote Amount').fill(notional)
  await dialog.getByLabel('Limit Price').fill(limitPrice)
  await dialog.getByLabel('Time In Force').selectOption('post_only')
  await dialog.getByLabel('Execution Shape').selectOption('single')
  await dialog.getByRole('button', { name: 'Submit' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return await waitForNewCommandId(page, prior)
}

async function openCommand(page: Page, search: string, label: string): Promise<void> {
  await page.getByRole('button', { name: /Commands Ctrl\+K/i }).click()
  const palette = page.getByRole('dialog', { name: 'Commands' })
  await palette.getByPlaceholder('Search commands').fill(search)
  await palette
    .getByRole('button', { name: new RegExp(label, 'i') })
    .first()
    .click()
}

async function commandIds(page: Page): Promise<Set<string>> {
  const ids = await page
    .locator('[data-testid="projection-command-list"] [data-command-id]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute('data-command-id'))
        .filter((value): value is string => value !== null && value.length > 0),
    )
  return new Set(ids)
}

async function waitForNewCommandId(page: Page, prior: Set<string>): Promise<string> {
  const handle = await page.waitForFunction(
    (existing) => {
      const known = new Set(existing)
      return (
        Array.from(document.querySelectorAll<HTMLElement>('[data-command-id]'))
          .map((node) => node.dataset.commandId)
          .find((id) => id !== undefined && !known.has(id)) ?? null
      )
    },
    [...prior],
    { timeout: commandTimeoutMs },
  )
  const id = await handle.jsonValue()
  if (typeof id !== 'string') throw new Error('new projected command did not expose an id')
  return id
}

async function expectCommandLifecycle(
  page: Page,
  commandId: string,
  lifecycle: string,
): Promise<void> {
  const row = page.locator(`[data-command-id="${commandId}"]`)
  await expect(row).toBeVisible({ timeout: commandTimeoutMs })
  await expect(row).toContainText(new RegExp(lifecycle, 'i'), { timeout: commandTimeoutMs })
}

async function expectProjectedFilledOrder(page: Page, commandId: string): Promise<void> {
  const order = await selectProjectedOrder(page, commandId)
  await expect(order).toContainText(/filled/i, { timeout: commandTimeoutMs })

  const details = page.getByTestId('projection-details')
  await expect(details).toContainText('Filled Quantity')
  await expect(details).toContainText('Remaining Quantity')
  await expect(details).toContainText('Reconciliation Required')
  await expect(details).toContainText('no')
  await expect(details.getByText('Execution Economics', { exact: true })).toBeVisible({
    timeout: commandTimeoutMs,
  })
  await expect(details.getByText(/^Fills \([1-9][0-9]*\)$/)).toBeVisible({
    timeout: commandTimeoutMs,
  })
}

async function selectProjectedOrder(page: Page, commandId: string) {
  await page.locator(`[data-command-id="${commandId}"]`).click()
  const order = page.locator('[data-node-kind="order"]').first()
  await expect(order).toBeVisible({ timeout: commandTimeoutMs })
  await order.click()
  return order
}

async function cancelSelectedOrder(page: Page): Promise<void> {
  await page.getByTestId('projection-actions').getByRole('button', { name: 'Cancel Order' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel Order' })
  await dialog.getByLabel('Confirm cancel order').check()
  await dialog.getByRole('button', { name: 'Cancel Order' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
}

async function expectProjectedProtection(page: Page): Promise<void> {
  const details = page.getByTestId('projection-details')
  await expect(details.getByText('Logical Native Protection', { exact: true })).toBeVisible({
    timeout: commandTimeoutMs,
  })
  await expect(details).toContainText(/tracking/i)
  await expect(details).toContainText(/take_profit/i)
  await expect(details).toContainText(/stop_loss/i)
}

async function bestEffortFlatten(page: Page): Promise<void> {
  try {
    await page.keyboard.press('Escape')
    const id = await submitSymbolFlatten(page)
    await expectCommandLifecycle(page, id, 'succeeded')
  } catch {
    // The final authoritative exchange assertion still fails loudly if cleanup did not complete.
  }
}

async function bestEffortCancelSelectedOrder(page: Page): Promise<void> {
  try {
    await page.keyboard.press('Escape')
    await cancelSelectedOrder(page)
  } catch {
    // The final authoritative exchange assertion still fails loudly if cleanup did not complete.
  }
}

async function exchangeState(request: APIRequestContext): Promise<{
  signedQuantity: number
  openOrders: number
}> {
  const [positions, orders] = await Promise.all([
    request.post('https://api.hyperliquid-testnet.xyz/info', {
      data: { type: 'clearinghouseState', user: walletAddress },
    }),
    request.post('https://api.hyperliquid-testnet.xyz/info', {
      data: { type: 'openOrders', user: walletAddress },
    }),
  ])
  if (!positions.ok() || !orders.ok()) {
    throw new Error(
      `Hyperliquid state query failed: positions=${positions.status()} orders=${orders.status()}`,
    )
  }
  const clearinghouse = (await positions.json()) as {
    assetPositions?: Array<{ position?: { coin?: string; szi?: string } }>
  }
  const openOrders = (await orders.json()) as Array<{ coin?: string }>
  const position = clearinghouse.assetPositions?.find((entry) => entry.position?.coin === symbol)
  return {
    signedQuantity: Number(position?.position?.szi ?? 0),
    openOrders: openOrders.filter((order) => order.coin === symbol).length,
  }
}

async function hyperliquidMid(request: APIRequestContext): Promise<number> {
  const response = await request.post('https://api.hyperliquid-testnet.xyz/info', {
    data: { type: 'allMids' },
  })
  if (!response.ok()) throw new Error(`Hyperliquid allMids failed: HTTP ${response.status()}`)
  const mids = (await response.json()) as Record<string, string>
  const mid = Number(mids[symbol])
  if (!Number.isFinite(mid) || mid <= 0) throw new Error(`Hyperliquid omitted ${symbol} mid`)
  return mid
}

async function expectExchangePosition(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => Math.abs((await exchangeState(request)).signedQuantity), {
      timeout: commandTimeoutMs,
    })
    .toBeGreaterThan(0)
}

async function expectExchangeProtectedPosition(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => await exchangeState(request), { timeout: commandTimeoutMs })
    .toMatchObject({ openOrders: 2 })
  await expectExchangePosition(request)
}

async function expectExchangeRestingOrder(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => await exchangeState(request), { timeout: commandTimeoutMs })
    .toEqual({ signedQuantity: 0, openOrders: 1 })
}

async function expectExchangeFlat(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => await exchangeState(request), { timeout: commandTimeoutMs })
    .toEqual({ signedQuantity: 0, openOrders: 0 })
}
