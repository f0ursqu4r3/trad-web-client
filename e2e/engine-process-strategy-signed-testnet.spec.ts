import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const enabled = process.env.ENGINE_PROCESS_SIGNED_TESTNET_E2E === '1'
const terminalBaseUrl = process.env.ENGINE_PROCESS_TERMINAL_BASE_URL || 'http://127.0.0.1:15173'
const testEmail = process.env.ENGINE_PROCESS_TEST_EMAIL || 'replacement-qualification@trad.local'
const accountLabel = process.env.ENGINE_PROCESS_ACCOUNT_LABEL || 'replacement-hl-testnet'
const walletAddress =
  process.env.ENGINE_PROCESS_WALLET_ADDRESS || '0x7d6cabebf3ab638ee10e0eabe671bfcfb8336dc3'
const symbol = process.env.ENGINE_PROCESS_SYMBOL || 'BTC'
const chaseNotional = process.env.ENGINE_PROCESS_NOTIONAL || '12'
const commandTimeoutMs = Number(process.env.ENGINE_PROCESS_COMMAND_TIMEOUT_MS || '90000')
const protectionRestartEnabled =
  process.env.ENGINE_PROCESS_PROTECTION_RESTART_SIGNED_TESTNET_E2E === '1'
const protectionRestartReadyPath =
  process.env.ENGINE_PROCESS_PROTECTION_RESTART_READY_PATH ||
  '/tmp/trad-engine-protection-restart-ready'
const protectionRestartUnavailablePath =
  process.env.ENGINE_PROCESS_PROTECTION_RESTART_UNAVAILABLE_PATH ||
  '/tmp/trad-engine-protection-restart-unavailable'
const protectionRestartResumedPath =
  process.env.ENGINE_PROCESS_PROTECTION_RESTART_RESUMED_PATH ||
  '/tmp/trad-engine-protection-restart-resumed'

interface ExchangeState {
  signedQuantity: number
  openOrders: number
}

interface TrailingEntryPrices {
  activation: string
  stopLoss: string
  takeProfit: string
}

interface CommandFrame {
  direction: 'sent' | 'received'
  kind: string
  requestId: string | null
  intentKind: string | null
  observedAt: number
}

test.describe.serial('replacement strategy workflows through the production terminal', () => {
  test.skip(!enabled, 'signed replacement-process qualification is explicitly gated')

  test('terminates a working Hyperliquid Testnet Chase across the cancel-fill race', async ({
    page,
    request,
  }) => {
    test.setTimeout(4 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let cleanupRequired = false
    try {
      await loginAndSelectAccount(page)
      const commandId = await submitChase(page)
      cleanupRequired = true

      await expectCommandLifecycle(page, commandId, 'running')
      const chase = await selectProjectedEntity(page, commandId, 'chase')
      await expect(page.getByTestId('projection-details')).toContainText('Market Stale')
      await expect(page.getByTestId('projection-details')).toContainText('Reprice Sequence')
      await expectExchangeRestingOrder(request)

      const cancelId = await submitSelectedAction(page, 'Cancel Chase')
      await expectCommandLifecycle(page, cancelId, 'succeeded')
      const terminal = await waitForEntityLifecycle(chase, ['canceled', 'filled'])
      if (terminal === 'filled') {
        await expectProjectedFilledOrder(page, commandId)
        const flattenId = await submitSymbolFlatten(page)
        await expectCommandLifecycle(page, flattenId, 'succeeded')
      }
      await expectExchangeFlat(request)
      cleanupRequired = false
    } finally {
      if (cleanupRequired) await bestEffortFlatten(page)
      await expectExchangeFlat(request)
    }
  })

  test('tracks and cancels a waiting Hyperliquid Testnet Trailing Entry', async ({
    page,
    request,
  }) => {
    test.setTimeout(4 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let cleanupRequired = false
    try {
      await loginAndSelectAccount(page)
      const prices = trailingEntryPrices(await hyperliquidMid(request))
      const commandId = await submitTrailingEntry(page, prices)
      cleanupRequired = true

      await expectCommandLifecycle(page, commandId, 'running')
      const entry = await selectProjectedEntity(page, commandId, 'trailing_entry')
      await expect(entry).toContainText(/running/i, { timeout: commandTimeoutMs })
      const details = page.getByTestId('projection-details')
      await expect(details).toContainText('waiting_for_activation', { timeout: commandTimeoutMs })
      await expectDetailValueOtherThan(page, 'Points', '0')
      await expectDetailValue(page, 'Market Stale', 'no')
      await expectExchangeFlat(request)

      const cancelId = await submitSelectedAction(page, 'Cancel Entry')
      await expectCommandLifecycle(page, cancelId, 'succeeded')
      await expect(entry).toContainText(/canceled/i, { timeout: commandTimeoutMs })
      await expectExchangeFlat(request)
      cleanupRequired = false
    } finally {
      if (cleanupRequired) await bestEffortFlatten(page)
      await expectExchangeFlat(request)
    }
  })

  test('enters, protects, and closes a Hyperliquid Testnet Trailing Entry', async ({
    page,
    request,
  }) => {
    test.setTimeout(5 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let commandId: string | null = null
    let exposurePossible = false
    let primaryError: unknown = null
    let cleanupError: unknown = null
    const commandFrames = observeCommandFrames(page)
    try {
      await loginAndSelectAccount(page)
      const prices = trailingEntryPrices(await hyperliquidMid(request))
      commandId = await submitTrailingEntry(page, prices)
      const entry = await selectProjectedEntity(page, commandId, 'trailing_entry')
      await expectDetailValueOtherThan(page, 'Points', '0')
      await expectDetailValue(page, 'Market Stale', 'no')

      // Once Enter Now is sent its outcome may be unknown even if the UI call has not returned.
      exposurePossible = true
      const enterId = await submitEnterNowWhenFresh(page, commandId, commandFrames)
      await expectCommandLifecycle(page, enterId, 'succeeded')
      await expectExchangeProtectedPosition(request)
      await expect(entry).toContainText(/position_open/i, { timeout: commandTimeoutMs })
      await expectProjectedFilledOrder(page, commandId)
      await expectProjectedProtection(page)

      await selectProjectedEntity(page, commandId, 'trailing_entry')
      const closeId = await submitSelectedAction(page, 'Close Position')
      await expectCommandLifecycle(page, closeId, 'succeeded')
      const completedEntry = await selectProjectedEntity(page, commandId, 'trailing_entry')
      await expect(completedEntry).toContainText(/completed/i, { timeout: commandTimeoutMs })
      await expectExchangeFlat(request)
      exposurePossible = false
    } catch (error) {
      primaryError = error
    } finally {
      if (exposurePossible) {
        try {
          await bestEffortCloseTrailingEntry(page, commandId)
        } catch (error) {
          cleanupError = error
        }
      }
      try {
        await expectExchangeFlat(request)
      } catch (error) {
        cleanupError = cleanupError ?? error
      }
    }

    if (primaryError !== null && cleanupError !== null) {
      throw new AggregateError(
        [primaryError, cleanupError],
        'qualification and cleanup both failed',
      )
    }
    if (primaryError !== null) throw primaryError
    if (cleanupError !== null) throw cleanupError
  })

  test('restores a live protected Trailing Entry across abrupt node restart', async ({
    page,
    request,
  }) => {
    test.skip(!protectionRestartEnabled, 'signed active-protection restart is separately gated')
    test.setTimeout(8 * 60_000)
    validateConfiguration()
    clearProtectionRestartMarkers()
    await expectExchangeFlat(request)

    let commandId: string | null = null
    let exposurePossible = false
    let primaryError: unknown = null
    let cleanupError: unknown = null
    const commandFrames = observeCommandFrames(page)
    try {
      await loginAndSelectAccount(page)
      const prices = trailingEntryPrices(await hyperliquidMid(request))
      commandId = await submitTrailingEntry(page, prices)
      await selectProjectedEntity(page, commandId, 'trailing_entry')
      await expectDetailValueOtherThan(page, 'Points', '0')
      await expectDetailValue(page, 'Market Stale', 'no')

      exposurePossible = true
      const enterId = await submitEnterNowWhenFresh(page, commandId, commandFrames)
      await expectCommandLifecycle(page, enterId, 'succeeded')
      await expectExchangeProtectedPosition(request)
      await expectProjectedFilledOrder(page, commandId)
      await expectProjectedProtection(page)

      writeMarker(protectionRestartReadyPath)
      const projectionState = page.getByTestId('projection-account-state')
      await expect(projectionState).toContainText(/unavailable|connect|transport|error/i, {
        timeout: 45_000,
      })
      writeMarker(protectionRestartUnavailablePath)
      await expect
        .poll(() => existsSync(protectionRestartResumedPath), { timeout: 90_000 })
        .toBe(true)
      await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', {
        timeout: 90_000,
      })
      await expect(projectionState).toHaveCount(0, { timeout: 90_000 })

      const entry = await selectProjectedEntity(page, commandId, 'trailing_entry')
      await expect(entry).toContainText(/position_open/i, { timeout: commandTimeoutMs })
      await expectProjectedFilledOrder(page, commandId)
      await expectProjectedProtection(page)
      await expectExchangeProtectedPosition(request)

      await selectProjectedEntity(page, commandId, 'trailing_entry')
      const closeId = await submitSelectedAction(page, 'Close Position')
      await expectCommandLifecycle(page, closeId, 'succeeded')
      const completedEntry = await selectProjectedEntity(page, commandId, 'trailing_entry')
      await expect(completedEntry).toContainText(/completed/i, { timeout: commandTimeoutMs })
      await expectExchangeFlat(request)
      exposurePossible = false
    } catch (error) {
      primaryError = error
    } finally {
      if (exposurePossible && existsSync(protectionRestartResumedPath)) {
        try {
          await bestEffortCloseTrailingEntry(page, commandId)
        } catch (error) {
          cleanupError = error
        }
      }
      if (existsSync(protectionRestartResumedPath)) {
        try {
          await expectExchangeFlat(request)
        } catch (error) {
          cleanupError = cleanupError ?? error
        }
      }
    }

    if (primaryError !== null && cleanupError !== null) {
      throw new AggregateError(
        [primaryError, cleanupError],
        'active-protection restart and cleanup both failed',
      )
    }
    if (primaryError !== null) throw primaryError
    if (cleanupError !== null) throw cleanupError
  })
})

function validateConfiguration(): void {
  const parsedNotional = Number(chaseNotional)
  if (!Number.isFinite(parsedNotional) || parsedNotional < 10 || parsedNotional > 25) {
    throw new Error('ENGINE_PROCESS_NOTIONAL must be between 10 and 25 USDC')
  }
  if (!/^0x[0-9a-f]{40}$/i.test(walletAddress)) {
    throw new Error('ENGINE_PROCESS_WALLET_ADDRESS must be a Hyperliquid user address')
  }
}

async function loginAndSelectAccount(page: Page): Promise<void> {
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

async function submitChase(page: Page): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'chase', 'Chase Order')
  const dialog = page.getByRole('dialog', { name: 'Chase Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByLabel('Amount Type').selectOption('quote_notional')
  await dialog.getByLabel('Quote Amount').fill(chaseNotional)
  await dialog.getByLabel('Adverse Boundary').selectOption('none')
  await dialog.getByLabel('Expiry Seconds').fill('60')
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Submit' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return await waitForNewCommandId(page, prior)
}

async function submitTrailingEntry(page: Page, prices: TrailingEntryPrices): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'te', 'Trailing Entry')
  const dialog = page.getByRole('dialog', { name: 'Trailing Entry' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByRole('textbox', { name: 'Risk Amount' }).fill('2.5')
  await dialog.getByRole('textbox', { name: 'Activation Price' }).fill(prices.activation)
  await dialog.getByRole('textbox', { name: 'Jump Threshold (bps)' }).fill('10')
  await dialog.getByRole('textbox', { name: 'Stop Loss Price' }).fill(prices.stopLoss)
  await dialog
    .getByRole('textbox', { name: 'Take Profit Price (optional)' })
    .fill(prices.takeProfit)
  await dialog.getByLabel('Execution Shape').selectOption('single')
  await dialog.getByLabel('Hyperliquid One-Way Behavior').selectOption('delta')
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
  await dialog.getByRole('button', { name: 'Flatten' }).click()
  return await waitForNewCommandId(page, prior)
}

async function submitSelectedAction(page: Page, label: string): Promise<string> {
  const prior = await commandIds(page)
  await page.getByTestId('projection-actions').getByRole('button', { name: label }).click()
  const dialog = page.getByRole('dialog', { name: label })
  const confirmation = dialog.getByLabel(new RegExp(`Confirm ${label.toLowerCase()}`, 'i'))
  if (await confirmation.count()) await confirmation.check()
  await dialog.getByRole('button', { name: label }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return await waitForNewCommandId(page, prior)
}

async function submitEnterNowWhenFresh(
  page: Page,
  commandId: string,
  commandFrames: CommandFrame[],
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await selectProjectedEntity(page, commandId, 'trailing_entry')
    await expectDetailValue(page, 'Market Stale', 'no')
    const prior = await commandIds(page)
    await page.getByTestId('projection-actions').getByRole('button', { name: 'Enter Now' }).click()
    const dialog = page.getByRole('dialog', { name: 'Enter Now' })
    await dialog.getByLabel('Confirm enter now').check()
    await dialog.getByRole('button', { name: 'Enter Now' }).click()

    let settled = ''
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      if ((await dialog.count()) === 0 || !(await dialog.isVisible())) {
        settled = 'accepted'
        break
      }
      const reason = (
        await dialog
          .locator('.submission-error')
          .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '').join(' '))
      ).trim()
      if (reason.length > 0) {
        settled = reason
        break
      }
      await page.waitForTimeout(100)
    }
    if (settled.length === 0) {
      const dialogs = await page.locator('[role="dialog"]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
          labelledBy: node.getAttribute('aria-labelledby'),
          visible: Boolean((node as HTMLElement).offsetWidth || (node as HTMLElement).offsetHeight),
        })),
      )
      throw new Error(
        `Enter Now acknowledgement trace: ${JSON.stringify(commandFrames)} dialogs: ${JSON.stringify(dialogs)}`,
      )
    }
    if (settled === 'accepted') return await waitForNewCommandId(page, prior)

    const reason = settled
    if (!/(?:trade stream is stale|no authoritative trade has reached)/i.test(reason)) {
      throw new Error(`Enter Now was rejected: ${reason || 'unknown reason'}`)
    }
    await dialog.getByRole('button', { name: 'Back' }).click()
  }
  throw new Error('Enter Now did not encounter a fresh authoritative trade within six attempts')
}

function observeCommandFrames(page: Page): CommandFrame[] {
  const frames: CommandFrame[] = []
  page.on('websocket', (socket) => {
    socket.on('framesent', (event) => recordCommandFrame(frames, 'sent', event.payload))
    socket.on('framereceived', (event) => recordCommandFrame(frames, 'received', event.payload))
  })
  return frames
}

function recordCommandFrame(
  frames: CommandFrame[],
  direction: CommandFrame['direction'],
  payload: string | Buffer,
): void {
  try {
    const message = JSON.parse(
      typeof payload === 'string' ? payload : payload.toString(),
    ) as Record<string, unknown>
    if (message.kind !== 'submit_command' && message.kind !== 'command_result') return
    const intent =
      typeof message.intent === 'object' && message.intent !== null
        ? (message.intent as Record<string, unknown>)
        : null
    frames.push({
      direction,
      kind: String(message.kind),
      requestId: typeof message.request_id === 'string' ? message.request_id : null,
      intentKind: typeof intent?.kind === 'string' ? intent.kind : null,
      observedAt: Date.now(),
    })
  } catch {
    // Only valid command metadata is relevant; auth and projection frames stay uninspected.
  }
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

async function selectProjectedEntity(page: Page, commandId: string, kind: string) {
  await page.locator(`[data-command-id="${commandId}"]`).click()
  const entity = page.locator(`[data-node-kind="${kind}"]`).first()
  await expect(entity).toBeVisible({ timeout: commandTimeoutMs })
  await entity.click()
  return entity
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

async function expectDetailValue(page: Page, label: string, value: string): Promise<void> {
  const cell = page
    .getByTestId('projection-details')
    .locator('.detail-cell')
    .filter({
      has: page.locator('.detail-label', { hasText: label }),
    })
  await expect(cell.locator('.detail-value')).toHaveText(value, { timeout: commandTimeoutMs })
}

async function expectDetailValueOtherThan(
  page: Page,
  label: string,
  excluded: string,
): Promise<void> {
  const cell = page
    .getByTestId('projection-details')
    .locator('.detail-cell')
    .filter({
      has: page.locator('.detail-label', { hasText: label }),
    })
  await expect(cell.locator('.detail-value')).not.toHaveText(excluded, {
    timeout: commandTimeoutMs,
  })
}

async function waitForEntityLifecycle(entity: Locator, lifecycles: string[]): Promise<string> {
  let found = ''
  await expect
    .poll(
      async () => {
        const text = (await entity.innerText()).toLowerCase()
        found = lifecycles.find((lifecycle) => text.includes(lifecycle)) ?? ''
        return found
      },
      { timeout: commandTimeoutMs },
    )
    .not.toBe('')
  return found
}

async function expectProjectedFilledOrder(page: Page, commandId: string): Promise<void> {
  const order = await selectProjectedEntity(page, commandId, 'order')
  await expect(order).toContainText(/filled/i, { timeout: commandTimeoutMs })
  const details = page.getByTestId('projection-details')
  await expect(details).toContainText('Filled Quantity')
  await expect(details).toContainText('Reconciliation Required')
  await expect(details).toContainText('no')
}

async function expectProjectedProtection(page: Page): Promise<void> {
  const details = page.getByTestId('projection-details')
  await expect(details.getByText('Exchange Protection', { exact: true })).toBeVisible({
    timeout: commandTimeoutMs,
  })
  const protection = details.locator('.evidence-section').filter({ hasText: 'Exchange Protection' })
  await expect(protection).toContainText(/take_profit/i)
  await expect(protection).toContainText(/stop_loss/i)
}

function trailingEntryPrices(mid: number): TrailingEntryPrices {
  return {
    activation: (mid * 0.9).toFixed(0),
    stopLoss: (mid * 0.8).toFixed(0),
    takeProfit: (mid * 1.05).toFixed(0),
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

async function exchangeState(request: APIRequestContext): Promise<ExchangeState> {
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

async function expectExchangeRestingOrder(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => await exchangeState(request), { timeout: commandTimeoutMs })
    .toEqual({ signedQuantity: 0, openOrders: 1 })
}

async function expectExchangeProtectedPosition(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => await exchangeState(request), { timeout: commandTimeoutMs })
    .toMatchObject({ openOrders: 2 })
  await expect
    .poll(async () => Math.abs((await exchangeState(request)).signedQuantity), {
      timeout: commandTimeoutMs,
    })
    .toBeGreaterThan(0)
}

async function expectExchangeFlat(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => await exchangeState(request), { timeout: commandTimeoutMs })
    .toEqual({ signedQuantity: 0, openOrders: 0 })
}

async function bestEffortFlatten(page: Page): Promise<void> {
  await page.goto(loginUrl())
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 })
  await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', { timeout: 30_000 })
  const id = await submitSymbolFlatten(page)
  await expectCommandLifecycle(page, id, 'succeeded')
}

async function bestEffortCloseTrailingEntry(page: Page, commandId: string | null): Promise<void> {
  if (commandId === null) {
    await bestEffortFlatten(page)
    return
  }
  try {
    await page.goto(loginUrl())
    await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 })
    await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', { timeout: 30_000 })
    await selectProjectedEntity(page, commandId, 'trailing_entry')
    const actions = page.getByTestId('projection-actions')
    if (await actions.getByRole('button', { name: 'Cancel Entry' }).count()) {
      const cancelId = await submitSelectedAction(page, 'Cancel Entry')
      await expectCommandLifecycle(page, cancelId, 'succeeded')
      return
    }
    if (!(await actions.getByRole('button', { name: 'Close Position' }).count())) {
      await bestEffortFlatten(page)
      return
    }
    const closeId = await submitSelectedAction(page, 'Close Position')
    await expectCommandLifecycle(page, closeId, 'succeeded')
  } catch (closeError) {
    try {
      await bestEffortFlatten(page)
    } catch (flattenError) {
      throw new AggregateError(
        [closeError, flattenError],
        'TE close and flatten cleanup both failed',
      )
    }
  }
}

function loginUrl(): string {
  const login = new URL('/auth/test-login', terminalBaseUrl)
  login.searchParams.set('email', testEmail)
  login.searchParams.set('return_to', '/terminal')
  return login.toString()
}

function clearProtectionRestartMarkers(): void {
  for (const path of [
    protectionRestartReadyPath,
    protectionRestartUnavailablePath,
    protectionRestartResumedPath,
  ]) {
    rmSync(path, { force: true })
  }
}

function writeMarker(path: string): void {
  writeFileSync(path, `${new Date().toISOString()}\n`, { mode: 0o600 })
}
