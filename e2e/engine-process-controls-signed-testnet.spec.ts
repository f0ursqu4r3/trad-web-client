import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

const enabled = process.env.ENGINE_PROCESS_SIGNED_TESTNET_E2E === '1'
const terminalBaseUrl = process.env.ENGINE_PROCESS_TERMINAL_BASE_URL || 'http://127.0.0.1:15173'
const testEmail = process.env.ENGINE_PROCESS_TEST_EMAIL || 'replacement-qualification@trad.local'
const accountLabel = process.env.ENGINE_PROCESS_ACCOUNT_LABEL || 'replacement-hl-testnet'
const walletAddress =
  process.env.ENGINE_PROCESS_WALLET_ADDRESS || '0x7d6cabebf3ab638ee10e0eabe671bfcfb8336dc3'
const symbol = process.env.ENGINE_PROCESS_SYMBOL || 'BTC'
const notional = process.env.ENGINE_PROCESS_NOTIONAL || '12'
const commandTimeoutMs = Number(process.env.ENGINE_PROCESS_COMMAND_TIMEOUT_MS || '90000')

interface ExchangeState {
  signedQuantity: number
  openOrders: ExchangeOrder[]
}

interface ExchangeOrder {
  coin?: string
  isTrigger?: boolean
  limitPx?: string
  reduceOnly?: boolean
  side?: string
  triggerPx?: string
}

interface ActiveAssetData {
  coin: string
  leverage: {
    type: 'cross' | 'isolated'
    value: number
    rawUsd?: string
  }
  user: string
}

interface ProjectionFrame {
  kind: string
  revision: number | null
  cycleId: string | null
  reconciliationStatus: string | null
  refreshOutcomeKind: string | null
  refreshRejectionReason: string | null
}

test.describe.serial('replacement P0 controls through the production terminal', () => {
  test.skip(!enabled, 'signed replacement-process qualification is explicitly gated')

  test('refreshes, previews, and applies exchange-confirmed leverage and margin mode', async ({
    page,
    request,
  }) => {
    test.setTimeout(2 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    const projectionFrames = observeProjectionFrames(page)
    await loginAndSelectAccount(page)
    await refreshAuthoritativeExchangeState(page, projectionFrames)
    await expectLiveExecutionPreview(page)

    try {
      await openManagedAccount(page)
      await setLeverage(page, 1, 'cross')
      await expectLeverage(request, 1, 'cross')
      await setLeverage(page, 2, 'isolated')
      await expectLeverage(request, 2, 'isolated')
    } finally {
      if (!page.isClosed()) {
        await ensureManagedAccountOpen(page)
        await setLeverage(page, 1, 'cross')
        await expectLeverage(request, 1, 'cross')
      }
    }

    await expectExchangeFlat(request)
  })

  test('cancels all remaining entry work without creating close exposure', async ({
    page,
    request,
  }) => {
    test.setTimeout(4 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let cleanupRequired = false
    try {
      await loginAndSelectAccount(page)
      const mid = await hyperliquidMid(request)
      const entryCommandId = await submitLimitOpen(page, (mid * 0.5).toFixed(0))
      cleanupRequired = true
      await expectCommandLifecycle(page, entryCommandId, 'running')
      await expectExchangeOrderCount(request, 1)

      const cancelCommandId = await submitCancelEntryWork(page)
      await expectCommandLifecycle(page, cancelCommandId, 'succeeded')
      await expectExchangeFlat(request)

      await page.locator(`[data-command-id="${entryCommandId}"]`).click()
      const order = page.locator('[data-node-kind="order"]').first()
      await expect(order).toContainText(/canceled/i, { timeout: commandTimeoutMs })
      cleanupRequired = false
    } finally {
      if (cleanupRequired) await bestEffortFlatten(page)
      await expectExchangeFlat(request)
    }
  })

  test('amends native protection and creates a reduce-only Limit close child', async ({
    page,
    request,
  }) => {
    test.setTimeout(6 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let exposurePossible = false
    let stage = 'login and price discovery'
    let primaryError: unknown = null
    try {
      await loginAndSelectAccount(page)
      const mid = await hyperliquidMid(request)
      const initialTakeProfit = (mid * 1.05).toFixed(0)
      const amendedTakeProfit = (mid * 1.04).toFixed(0)
      const stopLoss = (mid * 0.95).toFixed(0)

      stage = 'protected Market submission'
      const openCommandId = await submitMarketOpen(page, initialTakeProfit, stopLoss)
      exposurePossible = true
      stage = 'protected Market projection'
      await expectCommandLifecycle(page, openCommandId, 'succeeded')
      await selectProjectedOrder(page, openCommandId)
      await expectProjectedProtection(page)
      stage = 'protected Market exchange readback'
      await expectExchangeProtectedPosition(request)

      stage = 'native protection amendment'
      const amendmentCommandId = await amendSelectedProtection(page, amendedTakeProfit)
      await expectCommandLifecycle(page, amendmentCommandId, 'succeeded')
      await expectExchangeProtection(request, amendedTakeProfit, stopLoss)

      stage = 'reduce-only Limit close submission'
      await selectProjectedOrder(page, openCommandId)
      const closePrice = (mid * 1.2).toFixed(0)
      const closeCommandId = await submitSelectedLimitClose(page, closePrice)
      await expectCommandLifecycle(page, closeCommandId, 'running')
      const closeOrder = await selectProjectedOrder(page, closeCommandId)
      await expect(closeOrder).toContainText(/working/i, { timeout: commandTimeoutMs })
      await expectExchangeReduceOnlyLimit(request, closePrice)

      stage = 'reduce-only Limit close cancellation'
      await cancelSelectedOrder(page)
      await expect(closeOrder).toContainText(/canceled/i, { timeout: commandTimeoutMs })
      await expectExchangeOrderCount(request, 2)

      stage = 'final symbol flatten'
      const flattenCommandId = await submitSymbolFlatten(page)
      await expectCommandLifecycle(page, flattenCommandId, 'succeeded')
      await expectExchangeFlat(request)
      exposurePossible = false
    } catch (error) {
      primaryError = new Error(`signed protection/close flow failed during ${stage}`, {
        cause: error,
      })
    }

    const failures = primaryError === null ? [] : [primaryError]
    if (exposurePossible) {
      try {
        await bestEffortFlatten(page)
      } catch (error) {
        failures.push(new Error('signed protection/close cleanup command failed', { cause: error }))
      }
    }
    try {
      await expectExchangeFlat(request)
    } catch (error) {
      failures.push(new Error('signed protection/close cleanup left exchange state', { cause: error }))
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'signed protection/close qualification failed')
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
  page.setDefaultTimeout(commandTimeoutMs)
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(loginUrl())
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

async function refreshAuthoritativeExchangeState(
  page: Page,
  projectionFrames: ProjectionFrame[],
): Promise<void> {
  const control = page.getByTestId('reconciliation-control')
  const button = control.getByRole('button', { name: 'Refresh authoritative exchange state' })
  await expect(control.locator('[data-phase="ready"]')).toHaveText('reconciled', {
    timeout: 30_000,
  })
  const priorResults = projectionFrames.filter(
    (frame) => frame.kind === 'reconciliation_refresh_result',
  ).length
  await button.click()
  await expect
    .poll(
      () =>
        projectionFrames.filter((frame) => frame.kind === 'reconciliation_refresh_result').length,
      { timeout: 15_000 },
    )
    .toBeGreaterThan(priorResults)
  const result = projectionFrames
    .filter((frame) => frame.kind === 'reconciliation_refresh_result')
    .at(-1)
  const cycleId = result?.cycleId
  if (!cycleId || result?.refreshOutcomeKind !== 'accepted') {
    throw new Error(`reconciliation result omitted a cycle: ${JSON.stringify(projectionFrames)}`)
  }
  try {
    await expect(control).toHaveAttribute('title', new RegExp(cycleId), { timeout: 15_000 })
    await expect(control.locator('[data-phase="ready"]')).toHaveText('reconciled', {
      timeout: 15_000,
    })
  } catch (error) {
    throw new AggregateError(
      [error],
      `reconciliation projection trace: ${JSON.stringify(projectionFrames.slice(-20))}`,
    )
  }
}

function observeProjectionFrames(page: Page): ProjectionFrame[] {
  const frames: ProjectionFrame[] = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return
      try {
        const message = JSON.parse(payload) as Record<string, unknown>
        const kind = typeof message.kind === 'string' ? message.kind : ''
        if (
          kind !== 'account_snapshot' &&
          kind !== 'account_delta' &&
          kind !== 'reconciliation_refresh_result'
        ) {
          return
        }
        const projection =
          kind === 'account_snapshot'
            ? objectValue(message.snapshot)
            : kind === 'account_delta'
              ? objectValue(message.delta)
              : null
        const checkpoint = objectValue(projection?.checkpoint)
        const summary = objectValue(checkpoint?.summary)
        const outcome = objectValue(message.outcome)
        const rejection = objectValue(outcome?.rejection)
        frames.push({
          kind,
          revision: numberValue(checkpoint?.projection_revision),
          cycleId: stringValue(summary?.reconciliation_cycle_id) ?? stringValue(outcome?.cycle_id),
          reconciliationStatus: stringValue(summary?.reconciliation_status),
          refreshOutcomeKind: stringValue(outcome?.kind),
          refreshRejectionReason: stringValue(rejection?.reason),
        })
      } catch {
        // Only valid projection metadata is retained for bounded failure diagnostics.
      }
    })
  })
  return frames
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

async function expectLiveExecutionPreview(page: Page): Promise<void> {
  await openCommand(page, 'mo', 'Market Order')
  const dialog = page.getByRole('dialog', { name: 'Market Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Amount Type').selectOption('quote_notional')
  await dialog.getByLabel('Quote Amount').fill(notional)
  const preview = dialog.locator('.execution-preview')
  await expect(preview).toContainText('Ready', { timeout: commandTimeoutMs })
  await expect(preview).toContainText(symbol)
  await expect(preview).toContainText('Final submission replans against current exchange evidence.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
}

async function openManagedAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Manage', exact: true }).click()
  await expect(page.getByText('Account Settings', { exact: true })).toBeVisible()
  await expect(page.getByText(`( ${accountLabel} )`, { exact: true })).toBeVisible()
}

async function ensureManagedAccountOpen(page: Page): Promise<void> {
  if (
    await page
      .getByText('Account Settings', { exact: true })
      .isVisible()
      .catch(() => false)
  ) {
    return
  }
  await page.keyboard.press('Escape')
  await openManagedAccount(page)
}

async function setLeverage(
  page: Page,
  leverage: number,
  marginMode: ActiveAssetData['leverage']['type'],
): Promise<void> {
  const dialog = page.getByTestId('user-settings-dialog')
  const priorControlIds = new Set(
    await dialog
      .getByTestId('account-control-row')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-account-control-id') ?? '')),
  )
  const controls = page.getByTestId('account-leverage-controls')
  const symbolInput = controls.getByRole('textbox', { name: /Symbol/ })
  await symbolInput.fill(symbol)
  await controls.getByRole('spinbutton', { name: 'Lev', exact: true }).fill(String(leverage))
  await controls.getByRole('combobox', { name: 'Mode', exact: true }).selectOption(marginMode)
  await controls.getByRole('button', { name: 'Set Leverage' }).click()

  const acceptedMessage = `Applying leverage update for ${symbol}.`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (
      await page
        .getByText(acceptedMessage, { exact: true })
        .isVisible()
        .catch(() => false)
    )
      break
    const errors = await page.locator('[role="dialog"] p.text-error').allTextContents()
    const reason = errors.map((value) => value.trim()).find(Boolean)
    if (reason) throw new Error(`leverage command rejected in account settings: ${reason}`)
    await page.waitForTimeout(100)
  }
  await expect(page.getByText(acceptedMessage, { exact: true })).toBeVisible()

  let controlId = ''
  await expect
    .poll(
      async () => {
        const ids = await dialog
          .getByTestId('account-control-row')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-account-control-id') ?? ''),
          )
        controlId = ids.find((id) => id !== '' && !priorControlIds.has(id)) ?? ''
        return controlId
      },
      { timeout: 15_000 },
    )
    .not.toBe('')

  const control = dialog.locator(`[data-account-control-id="${controlId}"]`)
  await expect(control).toContainText(`${symbol}: ${leverage}x ${marginMode}`)
  await expect(control).toHaveAttribute('data-control-lifecycle', 'succeeded', {
    timeout: 15_000,
  })
}

async function submitMarketOpen(page: Page, takeProfit: string, stopLoss: string): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'mo', 'Market Order')
  const dialog = page.getByRole('dialog', { name: 'Market Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByLabel('Amount Type').selectOption('quote_notional')
  await dialog.getByLabel('Quote Amount').fill(notional)
  await dialog.getByLabel('Execution Shape').selectOption('single')
  await dialog.getByRole('button', { name: /Take Profit/i }).click()
  await dialog.getByRole('textbox', { name: 'TP 1 Trigger' }).fill(takeProfit)
  await dialog.getByRole('checkbox', { name: 'Stop loss' }).check()
  await dialog.getByRole('textbox', { name: 'SL Trigger' }).fill(stopLoss)
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Submit' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
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

async function submitCancelEntryWork(page: Page): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'ca', 'Cancel Entry Work')
  const dialog = page.getByRole('dialog', { name: 'Cancel Entry Work' })
  await dialog.getByLabel('Target').selectOption('account')
  await dialog.getByText(/Confirm cancellation/).click()
  await dialog.getByRole('button', { name: 'Cancel Entry Work' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return await waitForNewCommandId(page, prior)
}

async function amendSelectedProtection(page: Page, takeProfit: string): Promise<string> {
  const prior = await commandIds(page)
  await page
    .getByTestId('projection-protection-actions')
    .getByRole('button', { name: 'Edit Protection' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Edit Native Protection' })
  await dialog.getByLabel('TP 1 Trigger').fill(takeProfit)
  await dialog.getByLabel(/Apply this complete TP\/SL plan/).check()
  await dialog.getByRole('button', { name: 'Apply Protection' }).click()
  await expectAcceptedDialogClose(dialog, 'protection amendment')
  return await waitForNewCommandId(page, prior)
}

async function expectAcceptedDialogClose(dialog: Locator, action: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (!(await dialog.isVisible().catch(() => false))) return
    const errors = await dialog.locator('.submission-error').allTextContents()
    const reason = errors.map((value) => value.trim()).find(Boolean)
    if (reason) throw new Error(`${action} rejected: ${reason}`)
    await dialog.page().waitForTimeout(100)
  }
  throw new Error(`${action} did not close after acceptance`)
}

async function submitSelectedLimitClose(page: Page, limitPrice: string): Promise<string> {
  const prior = await commandIds(page)
  await page
    .getByTestId('projection-actions')
    .getByRole('button', { name: 'Close Exposure' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Close Exposure' })
  await dialog.getByLabel('Execution').selectOption('limit')
  await dialog.getByLabel('Limit Price').fill(limitPrice)
  await dialog.getByLabel('Time in Force').selectOption('post_only')
  await dialog.getByLabel('Confirm close exposure').check()
  await dialog.getByRole('button', { name: 'Close Exposure' }).click()
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
  await dialog.getByRole('button', { name: 'Flatten' }).click()
  return await waitForNewCommandId(page, prior)
}

async function cancelSelectedOrder(page: Page): Promise<void> {
  await page.getByTestId('projection-actions').getByRole('button', { name: 'Cancel Order' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel Order' })
  await dialog.getByLabel('Confirm cancel order').check()
  await dialog.getByRole('button', { name: 'Cancel Order' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
}

async function selectProjectedOrder(page: Page, commandId: string): Promise<Locator> {
  await page.locator(`[data-command-id="${commandId}"]`).click()
  const order = page.locator('[data-node-kind="order"]').first()
  await expect(order).toBeVisible({ timeout: commandTimeoutMs })
  await order.click()
  return order
}

async function expectProjectedProtection(page: Page): Promise<void> {
  const details = page.getByTestId('projection-details')
  await expect(details.getByText('Logical Native Protection', { exact: true })).toBeVisible({
    timeout: commandTimeoutMs,
  })
  await expect(details).toContainText(/tracking/i)
}

async function openCommand(page: Page, search: string, label: string): Promise<void> {
  await page.keyboard.press('Escape')
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

async function activeAssetData(request: APIRequestContext): Promise<ActiveAssetData> {
  const response = await request.post('https://api.hyperliquid-testnet.xyz/info', {
    data: { type: 'activeAssetData', user: walletAddress, coin: symbol },
  })
  if (!response.ok()) {
    throw new Error(`Hyperliquid activeAssetData failed: HTTP ${response.status()}`)
  }
  return (await response.json()) as ActiveAssetData
}

async function exchangeState(request: APIRequestContext): Promise<ExchangeState> {
  const [positions, orders] = await Promise.all([
    request.post('https://api.hyperliquid-testnet.xyz/info', {
      data: { type: 'clearinghouseState', user: walletAddress },
    }),
    request.post('https://api.hyperliquid-testnet.xyz/info', {
      data: { type: 'frontendOpenOrders', user: walletAddress },
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
  const allOrders = (await orders.json()) as ExchangeOrder[]
  const position = clearinghouse.assetPositions?.find((entry) => entry.position?.coin === symbol)
  return {
    signedQuantity: Number(position?.position?.szi ?? 0),
    openOrders: allOrders.filter((order) => order.coin === symbol),
  }
}

async function expectLeverage(
  request: APIRequestContext,
  leverage: number,
  marginMode: ActiveAssetData['leverage']['type'],
): Promise<void> {
  await expect
    .poll(async () => (await activeAssetData(request)).leverage, { timeout: commandTimeoutMs })
    .toMatchObject({ type: marginMode, value: leverage })
}

async function expectExchangeOrderCount(request: APIRequestContext, count: number): Promise<void> {
  await expect
    .poll(async () => (await exchangeState(request)).openOrders.length, {
      timeout: commandTimeoutMs,
    })
    .toBe(count)
}

async function expectExchangeProtectedPosition(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await exchangeState(request)
        const triggers = state.openOrders.filter((order) => order.isTrigger)
        return {
          hasExposure: Math.abs(state.signedQuantity) > 0,
          triggerCount: triggers.length,
          allReduceOnly: triggers.every((order) => order.reduceOnly === true),
        }
      },
      { timeout: commandTimeoutMs },
    )
    .toEqual({ hasExposure: true, triggerCount: 2, allReduceOnly: true })
}

async function expectExchangeProtection(
  request: APIRequestContext,
  takeProfit: string,
  stopLoss: string,
): Promise<void> {
  await expect
    .poll(
      async () =>
        (await exchangeState(request)).openOrders
          .filter((order) => order.isTrigger)
          .map((order) => Number(order.triggerPx))
          .sort((left, right) => left - right),
      { timeout: commandTimeoutMs },
    )
    .toEqual([Number(stopLoss), Number(takeProfit)].sort((left, right) => left - right))
}

async function expectExchangeReduceOnlyLimit(
  request: APIRequestContext,
  price: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const order = (await exchangeState(request)).openOrders.find(
          (candidate) => candidate.isTrigger === false,
        )
        return order === undefined
          ? null
          : { limitPrice: Number(order.limitPx), reduceOnly: order.reduceOnly, side: order.side }
      },
      { timeout: commandTimeoutMs },
    )
    .toEqual({ limitPrice: Number(price), reduceOnly: true, side: 'A' })
}

async function expectExchangeFlat(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await exchangeState(request)
        return { signedQuantity: state.signedQuantity, openOrders: state.openOrders.length }
      },
      { timeout: commandTimeoutMs },
    )
    .toEqual({ signedQuantity: 0, openOrders: 0 })
}

async function bestEffortFlatten(page: Page): Promise<void> {
  await page.goto(loginUrl())
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 })
  await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', { timeout: 30_000 })
  const commandId = await submitSymbolFlatten(page)
  await expectCommandLifecycle(page, commandId, 'succeeded')
}

function loginUrl(): string {
  const login = new URL('/auth/test-login', terminalBaseUrl)
  login.searchParams.set('email', testEmail)
  login.searchParams.set('return_to', '/terminal')
  return login.toString()
}
