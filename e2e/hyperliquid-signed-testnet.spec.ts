import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const enabled = process.env.HYPERLIQUID_SIGNED_TESTNET_E2E === '1'
const terminalBaseUrl = process.env.HYPERLIQUID_TERMINAL_BASE_URL || 'http://localhost:5273'
const testEmail = process.env.HYPERLIQUID_TEST_EMAIL || 'dev@trad.local'
const accountLabel = process.env.HYPERLIQUID_TEST_ACCOUNT_LABEL || 'HL Signed Testnet'
const symbol = process.env.HYPERLIQUID_TEST_SYMBOL || 'BTC'
const notional = Number(process.env.HYPERLIQUID_TEST_NOTIONAL || '20')
const commandTimeoutMs = Number(process.env.HYPERLIQUID_TEST_COMMAND_TIMEOUT_MS || '90000')

type QualificationResult = {
  accountLabel: string
  symbol: string
  referenceMid: number
  plainOpenCommandId?: string
  plainCloseCommandId?: string
  protectedOpenCommandId?: string
  protectedCloseCommandId?: string
  limitCommandId?: string
  cleanupCommandIds: string[]
}

test.describe.serial('Hyperliquid signed testnet through the production terminal', () => {
  test.skip(!enabled, 'signed Hyperliquid testnet orders are explicitly gated')

  test('market, protected market, and resting limit cancellation', async ({ page, request }) => {
    test.setTimeout(8 * 60_000)
    validateConfiguration()

    const result: QualificationResult = {
      accountLabel,
      symbol,
      referenceMid: await hyperliquidMid(request, symbol),
      cleanupCommandIds: [],
    }
    let restingLimitCommandId: string | null = null
    let exposurePossible = false

    try {
      await loginAndSelectTestnetAccount(page)

      exposurePossible = true
      result.plainOpenCommandId = await submitMarket(page, {
        action: 'Open',
        amount: notional,
      })
      await expectCommandStatus(page, result.plainOpenCommandId, 'SUCCEEDED')
      await expectOrderDeviceStatus(page, result.plainOpenCommandId, 'Filled')
      await expectExecutionEconomics(page)

      result.plainCloseCommandId = await submitMarket(page, {
        action: 'Close',
        amount: notional * 2,
      })
      await expectCommandStatus(page, result.plainCloseCommandId, 'SUCCEEDED')
      await expectOrderDeviceStatus(page, result.plainCloseCommandId, 'Filled')
      await expectExecutionEconomics(page)
      exposurePossible = false

      const protectedMid = await hyperliquidMid(request, symbol)
      exposurePossible = true
      result.protectedOpenCommandId = await submitMarket(page, {
        action: 'Open',
        amount: notional,
        takeProfit: protectedMid * 1.1,
        stopLoss: protectedMid * 0.9,
      })
      await expectOrderDeviceStatus(page, result.protectedOpenCommandId, 'Filled')
      await expectExecutionEconomics(page)
      await expectNativeProtectionStatus(page, result.protectedOpenCommandId, 'Tracking')

      result.protectedCloseCommandId = await submitMarket(page, {
        action: 'Close',
        amount: notional * 2,
      })
      await expectCommandStatus(page, result.protectedCloseCommandId, 'SUCCEEDED')
      await expectOrderDeviceStatus(page, result.protectedCloseCommandId, 'Filled')
      await expectExecutionEconomics(page)
      await expectNativeProtectionStatus(page, result.protectedOpenCommandId, /^(Canceled|Flat)$/)
      exposurePossible = false

      const limitMid = await hyperliquidMid(request, symbol)
      exposurePossible = true
      restingLimitCommandId = await submitLimit(page, {
        amount: notional,
        price: limitMid * 0.9,
      })
      result.limitCommandId = restingLimitCommandId
      await expectOrderDeviceStatus(
        page,
        restingLimitCommandId,
        'Already Sent And Awaiting Filling',
      )
      await cancelLimitDevice(page, restingLimitCommandId)
      await expectOrderDeviceStatus(page, restingLimitCommandId, 'Canceled')
      restingLimitCommandId = null
      exposurePossible = false

      await page.screenshot({ path: 'test-results/hyperliquid-signed-testnet.png', fullPage: true })
    } finally {
      await bestEffortCloseModal(page)
      if (restingLimitCommandId) {
        await bestEffortCancelLimit(page, restingLimitCommandId)
      }
      if (exposurePossible) {
        const cleanupId = await bestEffortFlattenLong(page)
        if (cleanupId) result.cleanupCommandIds.push(cleanupId)
      }
      writeResult(result)
    }
  })
})

function validateConfiguration() {
  if (!Number.isFinite(notional) || notional < 10 || notional > 100) {
    throw new Error('HYPERLIQUID_TEST_NOTIONAL must be between 10 and 100 USDC')
  }
  const url = new URL(terminalBaseUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('HYPERLIQUID_TERMINAL_BASE_URL must be HTTP(S)')
  }
}

async function loginAndSelectTestnetAccount(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  const login = new URL('/auth/test-login', terminalBaseUrl)
  login.searchParams.set('email', testEmail)
  login.searchParams.set('return_to', '/terminal')
  await page.goto(login.toString())
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 })
  await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', { timeout: 30_000 })

  const accountTrigger = page.locator('.account-trigger')
  await expect(accountTrigger).toBeVisible()
  if (!(await accountTrigger.innerText()).toLowerCase().includes(accountLabel.toLowerCase())) {
    await accountTrigger.click()
    await page.getByRole('menuitem').filter({ hasText: accountLabel }).click()
  }
  await expect(accountTrigger).toContainText(accountLabel)
  await expect(accountTrigger).toContainText(/HYPERLIQUID/i)
  await expect(accountTrigger).toContainText(/TESTNET/i)
  const accountSummary = await accountTrigger.innerText()
  if (/UNVALIDATED/i.test(accountSummary)) {
    throw new Error(
      `Hyperliquid testnet account '${accountLabel}' is not ready. Approve its generated agent and Trad builder with the account wallet, then refresh both approvals. Current state: ${accountSummary}`,
    )
  }
}

async function hyperliquidMid(request: APIRequestContext, coin: string): Promise<number> {
  let lastFailure = 'no response'
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await request.post('https://api.hyperliquid-testnet.xyz/info', {
      data: { type: 'allMids' },
    })
    if (response.ok()) {
      const mids = (await response.json()) as Record<string, string>
      const mid = Number(mids[coin])
      if (Number.isFinite(mid) && mid > 0) return mid
      lastFailure = `response did not contain a valid ${coin} mid`
    } else {
      lastFailure = `HTTP ${response.status()}`
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500))
  }
  throw new Error(`Hyperliquid testnet allMids failed after 4 attempts: ${lastFailure}`)
}

async function submitMarket(
  page: Page,
  order: { action: 'Open' | 'Close'; amount: number; takeProfit?: number; stopLoss?: number },
): Promise<string> {
  const before = await commandIds(page)
  await openCommandModal(page, 'mo', 'Market Order')
  const dialog = page.getByRole('dialog')
  await expectSelectedTestnetAccount(dialog)
  await dialog.getByLabel('Symbol').fill(symbol)
  await dialog.getByLabel('Action').selectOption(order.action)
  await dialog.getByLabel('USD Amount').fill(order.amount.toFixed(2))
  await dialog.getByLabel('Position Side').selectOption('Long')
  if (order.takeProfit !== undefined) {
    await dialog.getByLabel('Take Profit').fill(order.takeProfit.toFixed(8))
  }
  if (order.stopLoss !== undefined) {
    await dialog.getByLabel('Stop Loss').fill(order.stopLoss.toFixed(8))
  }
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled({ timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Submit' }).click()
  return await waitForNewCommandId(page, before)
}

async function submitLimit(page: Page, order: { amount: number; price: number }): Promise<string> {
  const before = await commandIds(page)
  await openCommandModal(page, 'Limit Order', 'Limit Order')
  const dialog = page.getByRole('dialog')
  await expectSelectedTestnetAccount(dialog)
  await dialog.getByLabel('Symbol').fill(symbol)
  await dialog.getByLabel('Action').selectOption('Open')
  await dialog.getByLabel('Position Side').selectOption('Long')
  await dialog.getByLabel('Amount Type').selectOption('notional')
  await dialog.getByLabel('USDC Amount').fill(order.amount.toFixed(2))
  await dialog.getByLabel('Limit Price').fill(order.price.toFixed(8))
  await dialog.getByLabel('Time in Force').selectOption('alo')
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled({ timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Submit' }).click()
  return await waitForNewCommandId(page, before)
}

async function openCommandModal(page: Page, search: string, label: string) {
  await page.keyboard.press('Control+K')
  const input = page.getByPlaceholder('Search commands...')
  await expect(input).toBeVisible()
  await input.fill(search)
  await page.getByRole('option').filter({ hasText: label }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function expectSelectedTestnetAccount(dialog: Locator) {
  const option = dialog.getByLabel('Account').locator('option:checked')
  await expect(option).toContainText(accountLabel)
  await expect(option).toContainText(/HYPERLIQUID/i)
  await expect(option).toContainText(/TESTNET/i)
}

async function commandIds(page: Page): Promise<Set<string>> {
  const ids = await page
    .locator('.command-row [aria-label="Copy command id"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute('title'))
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )
  return new Set(ids)
}

async function waitForNewCommandId(page: Page, before: Set<string>): Promise<string> {
  const handle = await page.waitForFunction(
    (existing) => {
      const ids = Array.from(
        document.querySelectorAll<HTMLElement>('.command-row [aria-label="Copy command id"]'),
      )
        .map((node) => node.title)
        .filter(Boolean)
      return ids.find((id) => !existing.includes(id)) || null
    },
    [...before],
    { timeout: commandTimeoutMs },
  )
  const commandId = await handle.jsonValue()
  if (typeof commandId !== 'string') throw new Error('new command did not expose an id')
  return commandId
}

function commandRow(page: Page, commandId: string): Locator {
  return page.locator('.command-row').filter({
    has: page.locator(`[aria-label="Copy command id"][title="${commandId}"]`),
  })
}

async function expectCommandStatus(page: Page, commandId: string, status: string) {
  const row = commandRow(page, commandId)
  await expect(row).toBeVisible({ timeout: commandTimeoutMs })
  await expect(row).toContainText(new RegExp(status, 'i'), { timeout: commandTimeoutMs })
}

async function inspectCommand(page: Page, commandId: string) {
  const row = commandRow(page, commandId)
  await expect(row).toBeVisible({ timeout: commandTimeoutMs })
  await row.click()
  await expect(page.locator('.device-row').first()).toBeVisible({ timeout: commandTimeoutMs })
}

async function expectOrderDeviceStatus(page: Page, commandId: string, status: string) {
  await inspectCommand(page, commandId)
  const deviceRow = page
    .locator('.device-row')
    .filter({ hasText: /^(Market|Limit) Order/ })
    .first()
  await expect(deviceRow).toBeVisible({ timeout: commandTimeoutMs })
  await deviceRow.click()
  await expect(page.getByText(/^(Market|Limit) Order Device$/)).toBeVisible({
    timeout: commandTimeoutMs,
  })
  await expect(page.getByText(status, { exact: true }).last()).toBeVisible({
    timeout: commandTimeoutMs,
  })
}

async function expectExecutionEconomics(page: Page) {
  const summary = page.getByTestId('execution-fill-summary')
  await expect(summary).toBeVisible({ timeout: commandTimeoutMs })
  for (const label of [
    'Total Fee',
    'Builder Component',
    'Exchange Component',
    'Reported Closed PnL',
  ]) {
    const value = summary.locator('div').filter({ hasText: label }).locator('dd')
    await expect(value).toContainText(/[-+]?\d[\d,.]*\s+USDC/i)
  }

  const details = summary.locator('..').locator('details')
  await details.locator('summary').click()
  const fills = page.getByTestId('execution-fill-list')
  await expect(fills).toBeVisible()
  await expect(fills.getByText('Taker', { exact: true }).first()).toBeVisible()
  await expect(fills.locator('[title]').filter({ hasText: /.+/ }).first()).toBeVisible()
  for (const label of ['Trade ID', 'Order ID', 'Transaction Hash']) {
    await expect(fills.getByText(new RegExp(`^${label}$`, 'i')).first()).toBeVisible()
  }
}

async function expectNativeProtectionStatus(
  page: Page,
  commandId: string,
  status: string | RegExp,
) {
  await inspectCommand(page, commandId)
  const deviceRow = page.locator('.device-row').filter({ hasText: 'Native Protection' }).first()
  await expect(deviceRow).toBeVisible({ timeout: commandTimeoutMs })
  await deviceRow.click()
  await expect(page.getByText('Native Protection', { exact: true }).last()).toBeVisible()
  const statusLocator =
    typeof status === 'string'
      ? page.getByText(status, { exact: true }).last()
      : page.getByText(status).last()
  await expect(statusLocator).toBeVisible({ timeout: commandTimeoutMs })
}

async function cancelLimitDevice(page: Page, commandId: string) {
  await inspectCommand(page, commandId)
  const deviceRow = page.locator('.device-row').filter({ hasText: 'Limit Order' }).first()
  await expect(deviceRow).toBeVisible({ timeout: commandTimeoutMs })
  await deviceRow.click()
  const cancel = page.getByRole('button', { name: 'Cancel limit order' })
  await expect(cancel).toBeEnabled({ timeout: commandTimeoutMs })
  await cancel.click()
}

async function bestEffortCancelLimit(page: Page, commandId: string) {
  try {
    await cancelLimitDevice(page, commandId)
    await expectOrderDeviceStatus(page, commandId, 'Canceled')
  } catch {
    // The order may already be terminal; result artifacts and server logs retain the outcome.
  }
}

async function bestEffortCloseModal(page: Page) {
  try {
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: 'Cancel' }).click()
    }
  } catch {
    // Cleanup continues even when the page failed before the terminal became interactive.
  }
}

async function bestEffortFlattenLong(page: Page): Promise<string | null> {
  try {
    const commandId = await submitMarket(page, {
      action: 'Close',
      amount: Math.max(100, notional * 5),
    })
    await expectCommandStatus(page, commandId, 'SUCCEEDED')
    return commandId
  } catch {
    return null
  }
}

function writeResult(result: QualificationResult) {
  const path = process.env.HYPERLIQUID_SIGNED_TESTNET_RESULT_PATH
  if (path) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`)
  }
}
