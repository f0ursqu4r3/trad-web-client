import { expect, test, type Page } from '@playwright/test'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const enabled = process.env.ENGINE_PROCESS_RESTART_E2E === '1'
const terminalBaseUrl = process.env.ENGINE_PROCESS_TERMINAL_BASE_URL || 'http://127.0.0.1:15173'
const testEmail = process.env.ENGINE_PROCESS_TEST_EMAIL || 'replacement-qualification@trad.local'
const accountLabel = process.env.ENGINE_PROCESS_ACCOUNT_LABEL || 'replacement-hl-testnet'
const readyPath =
  process.env.ENGINE_PROCESS_RESTART_READY_PATH || '/tmp/trad-engine-process-restart-ready'
const unavailablePath =
  process.env.ENGINE_PROCESS_RESTART_UNAVAILABLE_PATH ||
  '/tmp/trad-engine-process-restart-unavailable'
const resumedPath =
  process.env.ENGINE_PROCESS_RESTART_RESUMED_PATH || '/tmp/trad-engine-process-restart-resumed'

test.describe.serial('replacement process restart recovery', () => {
  test.skip(!enabled, 'replacement process restart qualification is explicitly gated')

  test('resubscribes the Vue projection after its owner node restarts', async ({ page }) => {
    test.setTimeout(3 * 60_000)
    clearMarkers()
    await loginAndSelectAccount(page)

    const retainedCommandId = await page
      .locator('[data-testid="projection-command-list"] [data-command-id]')
      .first()
      .getAttribute('data-command-id')
    expect(retainedCommandId).not.toBeNull()
    writeMarker(readyPath)

    const projectionState = page.getByTestId('projection-account-state')
    await expect(projectionState).toContainText(/unavailable|connect|transport|error/i, {
      timeout: 45_000,
    })
    writeMarker(unavailablePath)

    await expect.poll(() => existsSync(resumedPath), { timeout: 45_000 }).toBe(true)
    await expect(projectionState).toHaveCount(0, { timeout: 60_000 })
    await expect(page.locator(`[data-command-id="${retainedCommandId as string}"]`)).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]')
  })
})

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
  await expect(page.getByTestId('projection-account-state')).toHaveCount(0, { timeout: 30_000 })
  await expect(
    page.locator('[data-testid="projection-command-list"] [data-command-id]').first(),
  ).toBeVisible({ timeout: 30_000 })
}

function clearMarkers(): void {
  for (const path of [readyPath, unavailablePath, resumedPath]) rmSync(path, { force: true })
}

function writeMarker(path: string): void {
  writeFileSync(path, `${new Date().toISOString()}\n`, { mode: 0o600 })
}
