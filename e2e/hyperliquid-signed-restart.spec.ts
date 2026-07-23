import { expect, test, type Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const enabled = process.env.HYPERLIQUID_SIGNED_RESTART_BROWSER_E2E === '1'
const terminalBaseUrl = process.env.HYPERLIQUID_TERMINAL_BASE_URL || 'http://localhost:5273'
const testEmail = process.env.HYPERLIQUID_TEST_EMAIL || 'dev@trad.local'
const accountLabel = process.env.HYPERLIQUID_TEST_ACCOUNT_LABEL || 'HL Signed Testnet'
const statePath =
  process.env.HYPERLIQUID_RESTART_STATE_PATH || '/tmp/trad-hl-browser-restart-state.json'
const readyPath =
  process.env.HYPERLIQUID_BROWSER_RESTART_READY_PATH ||
  '/tmp/trad-hl-browser-restart-ready'
const disconnectedPath =
  process.env.HYPERLIQUID_BROWSER_RESTART_DISCONNECTED_PATH ||
  '/tmp/trad-hl-browser-restart-disconnected'
const resumedPath =
  process.env.HYPERLIQUID_BROWSER_RESTART_RESUMED_PATH ||
  '/tmp/trad-hl-browser-restart-resumed'

type RestartState = {
  commandId: string
  orderDeviceId: string
  nativeProtectionDeviceId: string
}

test.describe.serial('Hyperliquid signed browser restart recovery', () => {
  test.skip(!enabled, 'signed restart orchestration is explicitly gated')

  test('reconnects and renders the restored protected lifecycle', async ({ page }) => {
    test.setTimeout(4 * 60_000)
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as RestartState
    await loginAndSelectTestnetAccount(page)
    await expectProtectedLifecycle(page, state)

    writeFileSync(readyPath, `${new Date().toISOString()}\n`, { mode: 0o600 })
    const wsStatus = page.locator('.ws-indicator-status')
    await expect(wsStatus).not.toHaveText('[ready]', { timeout: 30_000 })
    writeFileSync(disconnectedPath, `${new Date().toISOString()}\n`, { mode: 0o600 })

    await expect.poll(() => existsSync(resumedPath), { timeout: 60_000 }).toBe(true)
    await expect(wsStatus).toHaveText('[ready]', { timeout: 60_000 })
    await expectProtectedLifecycle(page, state)
  })
})

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
}

async function expectProtectedLifecycle(page: Page, state: RestartState) {
  const row = page.locator('.command-row').filter({
    has: page.locator(`[aria-label="Copy command id"][title="${state.commandId}"]`),
  })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()

  const order = page
    .locator('.device-row')
    .filter({ hasText: /^(Market|Limit) Order/ })
    .first()
  await expect(order).toBeVisible({ timeout: 30_000 })
  await expect(order).toContainText('Completed')
  await order.click()
  await expect(page.locator('.device-details')).toContainText(state.orderDeviceId)
  await expect(page.locator('.device-details')).toContainText('Filled')

  const protection = page
    .locator('.device-row')
    .filter({ hasText: 'Native Protection' })
    .first()
  await expect(protection).toBeVisible({ timeout: 30_000 })
  await expect(protection).toContainText('Native TP/SL: Active')
  await expect(protection).toContainText('Running')
  await protection.click()
  await expect(page.locator('.device-details')).toContainText(state.nativeProtectionDeviceId)
  await expect(page.locator('.device-details')).toContainText('Tracking')
}
