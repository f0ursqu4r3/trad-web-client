import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import {
  bybitAccountInfo,
  bybitInstrument,
  bybitSymbolState,
  type BybitInstrument,
  type BybitOpenOrder,
} from './support/bybitTestnet'
import { runSignedQualification } from './support/signedQualification'

const enabled = process.env.ENGINE_PROCESS_BYBIT_SIGNED_TESTNET_E2E === '1'
const terminalBaseUrl = process.env.ENGINE_PROCESS_TERMINAL_BASE_URL || 'http://127.0.0.1:15173'
const testEmail = process.env.ENGINE_PROCESS_TEST_EMAIL || 'replacement-qualification@trad.local'
const accountLabel = process.env.ENGINE_PROCESS_BYBIT_ACCOUNT_LABEL || 'replacement-bybit-testnet'
const apiKey = process.env.BYBIT_TESTNET_API_KEY || ''
const apiSecret = process.env.BYBIT_TESTNET_API_SECRET || ''
const symbol = (process.env.ENGINE_PROCESS_BYBIT_SYMBOL || 'BTCUSDT').toUpperCase()
const configuredNotional = Number(process.env.ENGINE_PROCESS_BYBIT_NOTIONAL || '0')
const commandTimeoutMs = Number(process.env.ENGINE_PROCESS_COMMAND_TIMEOUT_MS || '90000')
const restartEnabled = process.env.ENGINE_PROCESS_BYBIT_PROTECTION_RESTART_E2E === '1'
const restartReadyPath =
  process.env.ENGINE_PROCESS_BYBIT_RESTART_READY_PATH || '/tmp/trad-bybit-restart-ready'
const restartUnavailablePath =
  process.env.ENGINE_PROCESS_BYBIT_RESTART_UNAVAILABLE_PATH || '/tmp/trad-bybit-restart-unavailable'
const restartResumedPath =
  process.env.ENGINE_PROCESS_BYBIT_RESTART_RESUMED_PATH || '/tmp/trad-bybit-restart-resumed'

const credentials = { apiKey, apiSecret }

test.describe.serial('Bybit replacement engine through the production terminal', () => {
  test.skip(!enabled, 'signed Bybit Testnet qualification is explicitly gated')

  test('refreshes and applies exchange-confirmed hedge mode and leverage', async ({
    page,
    request,
  }) => {
    test.setTimeout(3 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    await loginAndSelectAccount(page)
    await refreshAuthoritativeExchangeState(page)
    await expectLiveExecutionPreview(page, request)
    await openManagedAccount(page)
    await enableHedgeMode(page)
    await expectHedgeMode(request)

    const accountInfo = await bybitAccountInfo(request, credentials)
    expect(accountInfo.marginMode).toBe('REGULAR_MARGIN')
    expect(accountInfo.unifiedMarginStatus).toBeGreaterThan(0)

    try {
      await setLeverage(page, 1)
      await expectLeverage(request, 1)
      await setLeverage(page, 2)
      await expectLeverage(request, 2)
    } finally {
      if (!page.isClosed()) {
        await ensureManagedAccountOpen(page)
        await setLeverage(page, 1)
        await expectLeverage(request, 1)
      }
    }

    await expectExchangeFlat(request)
  })

  test('cancels all remaining Bybit entry work account-wide', async ({ page, request }) => {
    test.setTimeout(4 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    await runSignedQualification({
      label: 'Bybit account-wide entry cancellation',
      run: async (risk) => {
        await loginAndSelectAccount(page)
        const instrument = await bybitInstrument(request, symbol)
        const limitPrice = alignPrice(instrument.lastPrice * 0.7, instrument.tickSize)
        const quantity = alignQuantity(
          safeNotional(instrument) / limitPrice,
          instrument.quantityStep,
        )
        risk.markUncertain()
        const entryId = await submitLimitOpen(page, limitPrice, quantity)
        await expectCommandLifecycle(page, entryId, 'running')
        await expectExchangeOrderCount(request, 1)

        const cancelId = await submitCancelEntryWork(page)
        await expectCommandLifecycle(page, cancelId, 'succeeded')
        const order = await selectProjectedEntity(page, entryId, 'order')
        await expect(order).toContainText(/canceled/i, { timeout: commandTimeoutMs })
        await expectExchangeFlat(request)
        risk.markResolved()
      },
      cleanup: () => bestEffortFlatten(page),
      verifyFinalState: () => expectExchangeFlat(request),
    })
  })

  test('opens protected Market exposure and flattens it', async ({ page, request }) => {
    test.setTimeout(5 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    await runSignedQualification({
      label: 'Bybit protected Market lifecycle',
      run: async (risk) => {
        await loginAndSelectAccount(page)
        const instrument = await bybitInstrument(request, symbol)
        const prices = protectionPrices(instrument)
        risk.markUncertain()
        const openId = await submitMarketOpen(page, safeNotional(instrument), prices)

        await expectCommandLifecycle(page, openId, 'succeeded')
        await expectProjectedFilledOrder(page, openId)
        await expectProjectedProtection(page)
        await expectExchangeProtectedLong(request)

        const flattenId = await submitSymbolFlatten(page)
        await expectCommandLifecycle(page, flattenId, 'succeeded')
        await expectExchangeFlat(request)
        risk.markResolved()
      },
      cleanup: () => bestEffortFlatten(page),
      verifyFinalState: () => expectExchangeFlat(request),
    })
  })

  test('places and cancels a resting Limit entry', async ({ page, request }) => {
    test.setTimeout(5 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    await runSignedQualification({
      label: 'Bybit resting Limit cancellation',
      run: async (risk) => {
        await loginAndSelectAccount(page)
        const instrument = await bybitInstrument(request, symbol)
        const limitPrice = alignPrice(instrument.lastPrice * 0.7, instrument.tickSize)
        const quantity = alignQuantity(
          safeNotional(instrument) / limitPrice,
          instrument.quantityStep,
        )
        risk.markUncertain()
        const commandId = await submitLimitOpen(page, limitPrice, quantity)

        await expectCommandLifecycle(page, commandId, 'running')
        const order = await selectProjectedEntity(page, commandId, 'order')
        await expect(order).toContainText(/working/i, { timeout: commandTimeoutMs })
        await expectExchangeOrderCount(request, 1)

        await cancelSelectedOrder(page)
        await expect(order).toContainText(/canceled/i, { timeout: commandTimeoutMs })
        await expectExchangeFlat(request)
        risk.markResolved()
      },
      cleanup: () => bestEffortFlatten(page),
      verifyFinalState: () => expectExchangeFlat(request),
    })
  })

  test('creates and cancels a reduce-only Limit close without dropping protection', async ({
    page,
    request,
  }) => {
    test.setTimeout(6 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    await runSignedQualification({
      label: 'Bybit reduce-only Limit close lifecycle',
      run: async (risk) => {
        await loginAndSelectAccount(page)
        const instrument = await bybitInstrument(request, symbol)
        risk.markUncertain()
        const openId = await submitMarketOpen(
          page,
          safeNotional(instrument),
          protectionPrices(instrument),
        )
        await expectCommandLifecycle(page, openId, 'succeeded')
        await expectExchangeProtectedLong(request)
        await selectProjectedEntity(page, openId, 'order')

        const closePrice = alignPrice(instrument.lastPrice * 1.3, instrument.tickSize)
        const closeId = await submitSelectedLimitClose(page, closePrice)
        await expectCommandLifecycle(page, closeId, 'running')
        const closeOrder = await selectProjectedEntity(page, closeId, 'order')
        await expect(closeOrder).toContainText(/working/i, { timeout: commandTimeoutMs })
        await expectExchangeReduceOnlyLimit(request, closePrice)

        await cancelSelectedOrder(page)
        await expect(closeOrder).toContainText(/canceled/i, { timeout: commandTimeoutMs })
        await expectExchangeProtectionOrderCount(request, 2)

        const flattenId = await submitSymbolFlatten(page)
        await expectCommandLifecycle(page, flattenId, 'succeeded')
        await expectExchangeFlat(request)
        risk.markResolved()
      },
      cleanup: () => bestEffortFlatten(page),
      verifyFinalState: () => expectExchangeFlat(request),
    })
  })

  test('cancels a waiting Trailing Entry without creating exposure', async ({ page, request }) => {
    test.setTimeout(5 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    await runSignedQualification({
      label: 'Bybit waiting Trailing Entry cancellation',
      run: async (risk) => {
        await loginAndSelectAccount(page)
        const instrument = await bybitInstrument(request, symbol)
        risk.markUncertain()
        const commandId = await submitTrailingEntry(page, instrument)

        await expectCommandLifecycle(page, commandId, 'running')
        const entry = await selectProjectedEntity(page, commandId, 'trailing_entry')
        await expect(entry).toContainText(/running/i, { timeout: commandTimeoutMs })
        await expect(page.getByTestId('projection-details')).toContainText(
          'waiting_for_activation',
          {
            timeout: commandTimeoutMs,
          },
        )
        await expectExchangeFlat(request)

        const cancelId = await submitSelectedAction(page, 'Cancel Entry')
        await expectCommandLifecycle(page, cancelId, 'succeeded')
        await expect(entry).toContainText(/canceled/i, { timeout: commandTimeoutMs })
        await expectExchangeFlat(request)
        risk.markResolved()
      },
      cleanup: () => bestEffortFlatten(page),
      verifyFinalState: () => expectExchangeFlat(request),
    })
  })

  test('enters, protects, and closes a Trailing Entry', async ({ page, request }) => {
    test.setTimeout(6 * 60_000)
    validateConfiguration()
    await expectExchangeFlat(request)

    let commandId: string | null = null
    await runSignedQualification({
      label: 'Bybit Trailing Entry lifecycle',
      run: async (risk) => {
        await loginAndSelectAccount(page)
        const instrument = await bybitInstrument(request, symbol)
        commandId = await submitTrailingEntry(page, instrument)
        await selectProjectedEntity(page, commandId, 'trailing_entry')

        risk.markUncertain()
        const enterId = await submitSelectedAction(page, 'Enter Now')
        await expectCommandLifecycle(page, enterId, 'succeeded')
        await expectExchangeProtectedLong(request)
        await expectProjectedFilledOrder(page, commandId)
        await expectProjectedProtection(page)

        await selectProjectedEntity(page, commandId, 'trailing_entry')
        const closeId = await submitSelectedAction(page, 'Close Position')
        await expectCommandLifecycle(page, closeId, 'succeeded')
        const completed = await selectProjectedEntity(page, commandId, 'trailing_entry')
        await expect(completed).toContainText(/completed/i, { timeout: commandTimeoutMs })
        await expectExchangeFlat(request)
        risk.markResolved()
      },
      cleanup: () => bestEffortCloseTrailingEntry(page, commandId),
      verifyFinalState: () => expectExchangeFlat(request),
    })
  })

  test('restores active native protection across abrupt node restart', async ({
    page,
    request,
  }) => {
    test.skip(!restartEnabled, 'signed Bybit active-protection restart is separately gated')
    test.setTimeout(8 * 60_000)
    validateConfiguration()
    clearRestartMarkers()
    await expectExchangeFlat(request)

    let openId: string | null = null
    let exposurePossible = false
    try {
      await loginAndSelectAccount(page)
      const instrument = await bybitInstrument(request, symbol)
      openId = await submitMarketOpen(page, safeNotional(instrument), protectionPrices(instrument))
      exposurePossible = true
      await expectCommandLifecycle(page, openId, 'succeeded')
      await expectProjectedFilledOrder(page, openId)
      await expectProjectedProtection(page)
      await expectExchangeProtectedLong(request)

      writeMarker(restartReadyPath)
      const projectionState = page.getByTestId('projection-account-state')
      await expect(projectionState).toContainText(/unavailable|connect|transport|error/i, {
        timeout: 45_000,
      })
      writeMarker(restartUnavailablePath)
      await expect.poll(() => existsSync(restartResumedPath), { timeout: 90_000 }).toBe(true)
      await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', {
        timeout: 90_000,
      })
      await expect(projectionState).toHaveCount(0, { timeout: 90_000 })

      await expectProjectedFilledOrder(page, openId)
      await expectProjectedProtection(page)
      await expectExchangeProtectedLong(request)
      const flattenId = await submitSymbolFlatten(page)
      await expectCommandLifecycle(page, flattenId, 'succeeded')
      await expectExchangeFlat(request)
      exposurePossible = false
    } finally {
      if (exposurePossible && existsSync(restartResumedPath)) await bestEffortFlatten(page)
      if (existsSync(restartResumedPath)) await expectExchangeFlat(request)
      if (openId === null) clearRestartMarkers()
    }
  })
})

function validateConfiguration(): void {
  if (!apiKey || !apiSecret) {
    throw new Error('BYBIT_TESTNET_API_KEY and BYBIT_TESTNET_API_SECRET are required')
  }
  if (!/^[A-Z0-9]+USDT$/.test(symbol)) {
    throw new Error('ENGINE_PROCESS_BYBIT_SYMBOL must be an uppercase USDT perpetual symbol')
  }
  if (
    configuredNotional !== 0 &&
    (!Number.isFinite(configuredNotional) || configuredNotional < 5 || configuredNotional > 250)
  ) {
    throw new Error('ENGINE_PROCESS_BYBIT_NOTIONAL must be between 5 and 250 USDT')
  }
}

async function loginAndSelectAccount(page: Page): Promise<void> {
  page.setDefaultTimeout(30_000)
  await page.setViewportSize({ width: 1600, height: 1000 })
  const login = new URL('/auth/test-login', terminalBaseUrl)
  login.searchParams.set('email', testEmail)
  login.searchParams.set('return_to', '/terminal')
  await page.goto(login.toString())
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 })
  await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', { timeout: 30_000 })

  const account = page.locator('.account-trigger')
  if (
    !(await account
      .getByText(accountLabel, { exact: false })
      .isVisible()
      .catch(() => false))
  ) {
    await account.click()
    await page.getByRole('menuitem', { name: new RegExp(escapeRegExp(accountLabel), 'i') }).click()
  }
  await expect(account).toContainText(accountLabel, { timeout: 30_000 })
  await expect(account).toContainText(/BYBIT/i)
  await expect(account).toContainText(/TESTNET/i)
  await expect(account).toContainText(/HEDGE ONLY/i)
  await expect(page.getByTestId('projection-command-list')).toBeVisible()
}

async function refreshAuthoritativeExchangeState(page: Page): Promise<void> {
  const control = page.getByTestId('reconciliation-control')
  const state = control.locator('.reconciliation-state')
  await expect(state).toHaveAttribute('data-phase', 'ready', { timeout: commandTimeoutMs })
  const priorCycle = await control.getAttribute('title')
  await control.getByRole('button', { name: 'Refresh authoritative exchange state' }).click()
  await expect
    .poll(() => control.getAttribute('title'), { timeout: commandTimeoutMs })
    .not.toBe(priorCycle)
  await expect(state).toHaveAttribute('data-phase', 'ready', { timeout: commandTimeoutMs })
  await expect(state).toHaveText('reconciled')
}

async function expectLiveExecutionPreview(page: Page, request: APIRequestContext): Promise<void> {
  const instrument = await bybitInstrument(request, symbol)
  await openCommand(page, 'mo', 'Market Order')
  const dialog = page.getByRole('dialog', { name: 'Market Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Amount Type').selectOption('quote_notional')
  await dialog.getByLabel('Quote Amount').fill(decimalString(safeNotional(instrument)))
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

async function enableHedgeMode(page: Page): Promise<void> {
  const controls = page.getByTestId('account-leverage-controls')
  const row = await triggerAccountControl(
    page,
    () => controls.getByRole('button', { name: 'Enable Hedge' }).click(),
    `Applying hedge-mode enable for ${accountLabel}.`,
  )
  await expect(row).toContainText('Position mode: hedge')
  await expect(row).toHaveAttribute('data-control-lifecycle', 'succeeded', {
    timeout: commandTimeoutMs,
  })
}

async function setLeverage(page: Page, leverage: number): Promise<void> {
  const controls = page.getByTestId('account-leverage-controls')
  await controls.getByRole('textbox', { name: /Symbols/ }).fill(symbol)
  await controls.getByRole('spinbutton', { name: 'Lev', exact: true }).fill(String(leverage))
  const row = await triggerAccountControl(
    page,
    () => controls.getByRole('button', { name: 'Set Leverage' }).click(),
    `Applying leverage update for ${symbol}.`,
  )
  await expect(row).toContainText(`${symbol}: ${leverage}x`)
  await expect(row).toHaveAttribute('data-control-lifecycle', 'succeeded', {
    timeout: commandTimeoutMs,
  })
}

async function triggerAccountControl(
  page: Page,
  trigger: () => Promise<void>,
  acceptedMessage: string,
): Promise<Locator> {
  const dialog = page.getByTestId('user-settings-dialog')
  const priorIds = new Set(
    await dialog
      .getByTestId('account-control-row')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-account-control-id') ?? '')),
  )
  await trigger()
  await expect(page.getByText(acceptedMessage, { exact: true })).toBeVisible({
    timeout: commandTimeoutMs,
  })

  let controlId = ''
  await expect
    .poll(
      async () => {
        const ids = await dialog
          .getByTestId('account-control-row')
          .evaluateAll((rows) =>
            rows.map((row) => row.getAttribute('data-account-control-id') ?? ''),
          )
        controlId = ids.find((id) => id !== '' && !priorIds.has(id)) ?? ''
        return controlId
      },
      { timeout: commandTimeoutMs },
    )
    .not.toBe('')
  return dialog.locator(`[data-account-control-id="${controlId}"]`)
}

async function submitMarketOpen(
  page: Page,
  notional: number,
  protection: { takeProfit: string; stopLoss: string },
): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'mo', 'Market Order')
  const dialog = page.getByRole('dialog', { name: 'Market Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByLabel('Amount Type').selectOption('quote_notional')
  await dialog.getByLabel('Quote Amount').fill(decimalString(notional))
  await dialog.getByLabel('Execution Shape').selectOption('single')
  await dialog.getByRole('button', { name: /Take Profit/i }).click()
  await dialog.getByRole('textbox', { name: 'TP 1 Trigger' }).fill(protection.takeProfit)
  await dialog.getByRole('checkbox', { name: 'Stop loss' }).check()
  await dialog.getByRole('textbox', { name: 'SL Trigger' }).fill(protection.stopLoss)
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Submit' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return await waitForNewCommandId(page, prior)
}

async function submitLimitOpen(page: Page, price: number, quantity: number): Promise<string> {
  const prior = await commandIds(page)
  await openCommand(page, 'lo', 'Limit Order')
  const dialog = page.getByRole('dialog', { name: 'Limit Order' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByLabel('Amount Type').selectOption('base')
  await dialog.getByLabel('Base Quantity').fill(decimalString(quantity))
  await dialog.getByLabel('Limit Price').fill(decimalString(price))
  await dialog.getByLabel('Time In Force').selectOption('post_only')
  await dialog.getByLabel('Execution Shape').selectOption('single')
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Submit' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  return await waitForNewCommandId(page, prior)
}

async function submitTrailingEntry(page: Page, instrument: BybitInstrument): Promise<string> {
  const activation = alignPrice(instrument.lastPrice * 0.9, instrument.tickSize)
  const stopLoss = alignPrice(instrument.lastPrice * 0.8, instrument.tickSize)
  const takeProfit = alignPrice(instrument.lastPrice * 1.05, instrument.tickSize)
  const minimumEntryNotional = Math.max(
    instrument.minimumNotional * 1.25,
    instrument.quantityStep * activation * 1.25,
  )
  const riskFraction = (activation - stopLoss) / activation
  const riskAmount = minimumEntryNotional * riskFraction

  const prior = await commandIds(page)
  await openCommand(page, 'te', 'Trailing Entry')
  const dialog = page.getByRole('dialog', { name: 'Trailing Entry' })
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(symbol)
  await dialog.getByLabel('Position Side').selectOption('long')
  await dialog.getByRole('textbox', { name: 'Activation Price' }).fill(decimalString(activation))
  await dialog.getByRole('textbox', { name: 'Jump Threshold (bps)' }).fill('10')
  await dialog.getByRole('textbox', { name: 'Stop Loss Price' }).fill(decimalString(stopLoss))
  await dialog
    .getByRole('textbox', { name: 'Take Profit Price (optional)' })
    .fill(decimalString(takeProfit))
  await dialog.getByRole('textbox', { name: 'Risk Amount' }).fill(riskAmount.toFixed(4))
  await dialog.getByLabel('Execution Shape').selectOption('single')
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled({
    timeout: commandTimeoutMs,
  })
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

async function submitSelectedLimitClose(page: Page, limitPrice: number): Promise<string> {
  const prior = await commandIds(page)
  await page
    .getByTestId('projection-actions')
    .getByRole('button', { name: 'Close Exposure' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Close Exposure' })
  await dialog.getByLabel('Execution').selectOption('limit')
  await dialog.getByLabel('Limit Price').fill(decimalString(limitPrice))
  await dialog.getByLabel('Time in Force').selectOption('post_only')
  await dialog.getByLabel('Confirm close exposure').check()
  await dialog.getByRole('button', { name: 'Close Exposure' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
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

async function cancelSelectedOrder(page: Page): Promise<void> {
  await page.getByTestId('projection-actions').getByRole('button', { name: 'Cancel Order' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cancel Order' })
  await dialog.getByLabel('Confirm cancel order').check()
  await dialog.getByRole('button', { name: 'Cancel Order' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
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

async function selectProjectedEntity(
  page: Page,
  commandId: string,
  entityKind: string,
): Promise<Locator> {
  await page.locator(`[data-command-id="${commandId}"]`).click()
  const entity = page.locator(`[data-node-kind="${entityKind}"]`).first()
  await expect(entity).toBeVisible({ timeout: commandTimeoutMs })
  await entity.click()
  return entity
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
  await expect(details.getByText('Logical Native Protection', { exact: true })).toBeVisible({
    timeout: commandTimeoutMs,
  })
  await expect(details).toContainText(/tracking/i)
  await expect(details).toContainText(/take_profit/i)
  await expect(details).toContainText(/stop_loss/i)
}

async function expectExchangeProtectedLong(request: APIRequestContext): Promise<void> {
  await expect
    .poll(async () => await bybitSymbolState(request, credentials, symbol), {
      timeout: commandTimeoutMs,
    })
    .toMatchObject({ shortQuantity: 0 })
  await expect
    .poll(async () => (await bybitSymbolState(request, credentials, symbol)).longQuantity, {
      timeout: commandTimeoutMs,
    })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => (await bybitSymbolState(request, credentials, symbol)).openOrders.length, {
      timeout: commandTimeoutMs,
    })
    .toBeGreaterThanOrEqual(2)
}

async function expectExchangeOrderCount(
  request: APIRequestContext,
  expected: number,
): Promise<void> {
  await expect
    .poll(async () => (await bybitSymbolState(request, credentials, symbol)).openOrders.length, {
      timeout: commandTimeoutMs,
    })
    .toBe(expected)
}

async function expectHedgeMode(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () =>
        (await bybitSymbolState(request, credentials, symbol)).positions
          .map((position) => position.positionIdx)
          .sort(),
      { timeout: commandTimeoutMs },
    )
    .toEqual([1, 2])
}

async function expectLeverage(request: APIRequestContext, expected: number): Promise<void> {
  await expect
    .poll(
      async () =>
        (await bybitSymbolState(request, credentials, symbol)).positions.map((position) =>
          Number(position.leverage),
        ),
      { timeout: commandTimeoutMs },
    )
    .toEqual([expected, expected])
}

async function expectExchangeReduceOnlyLimit(
  request: APIRequestContext,
  expectedPrice: number,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await bybitSymbolState(request, credentials, symbol)
        const order = state.openOrders.find(isPlainLimitOrder)
        return order === undefined
          ? null
          : {
              positionIdx: order.positionIdx,
              price: Number(order.price),
              reduceOnly: order.reduceOnly,
              side: order.side,
            }
      },
      { timeout: commandTimeoutMs },
    )
    .toEqual({ positionIdx: 1, price: expectedPrice, reduceOnly: true, side: 'Sell' })
}

async function expectExchangeProtectionOrderCount(
  request: APIRequestContext,
  expected: number,
): Promise<void> {
  await expect
    .poll(
      async () =>
        (await bybitSymbolState(request, credentials, symbol)).openOrders.filter(
          (order) => !isPlainLimitOrder(order),
        ).length,
      { timeout: commandTimeoutMs },
    )
    .toBe(expected)
}

function isPlainLimitOrder(order: BybitOpenOrder): boolean {
  return (
    order.orderType === 'Limit' &&
    Number(order.triggerPrice || 0) === 0 &&
    order.stopOrderType === ''
  )
}

async function expectExchangeFlat(request: APIRequestContext): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await bybitSymbolState(request, credentials, symbol)
        return {
          longQuantity: state.longQuantity,
          shortQuantity: state.shortQuantity,
          openOrders: state.openOrders.length,
        }
      },
      { timeout: commandTimeoutMs },
    )
    .toEqual({ longQuantity: 0, shortQuantity: 0, openOrders: 0 })
}

async function bestEffortFlatten(page: Page): Promise<void> {
  try {
    await page.keyboard.press('Escape')
    const id = await submitSymbolFlatten(page)
    await expectCommandLifecycle(page, id, 'succeeded')
  } catch {
    // The final independent exchange assertion remains authoritative.
  }
}

async function bestEffortCloseTrailingEntry(page: Page, commandId: string | null): Promise<void> {
  try {
    await page.keyboard.press('Escape')
    if (commandId) {
      await selectProjectedEntity(page, commandId, 'trailing_entry')
      const closeId = await submitSelectedAction(page, 'Close Position')
      await expectCommandLifecycle(page, closeId, 'succeeded')
      return
    }
  } catch {
    // Fall through to the account-authoritative flatten path.
  }
  await bestEffortFlatten(page)
}

function protectionPrices(instrument: BybitInstrument): {
  takeProfit: string
  stopLoss: string
} {
  return {
    takeProfit: decimalString(alignPrice(instrument.lastPrice * 1.05, instrument.tickSize)),
    stopLoss: decimalString(alignPrice(instrument.lastPrice * 0.95, instrument.tickSize)),
  }
}

function safeNotional(instrument: BybitInstrument): number {
  if (configuredNotional > 0) return configuredNotional
  return Math.max(
    instrument.minimumNotional * 1.25,
    instrument.quantityStep * instrument.lastPrice * 1.25,
  )
}

function alignPrice(value: number, tickSize: number): number {
  return Number((Math.round(value / tickSize) * tickSize).toFixed(decimalPlaces(tickSize)))
}

function alignQuantity(value: number, quantityStep: number): number {
  return Number(
    (Math.ceil(value / quantityStep) * quantityStep).toFixed(decimalPlaces(quantityStep)),
  )
}

function decimalPlaces(step: number): number {
  const text = step.toString().toLowerCase()
  if (text.includes('e-')) return Number(text.split('e-')[1])
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0
}

function decimalString(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 12, useGrouping: false })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clearRestartMarkers(): void {
  for (const path of [restartReadyPath, restartUnavailablePath, restartResumedPath]) {
    rmSync(path, { force: true })
  }
}

function writeMarker(path: string): void {
  writeFileSync(path, `${Date.now()}\n`, { flag: 'w', mode: 0o600 })
}
