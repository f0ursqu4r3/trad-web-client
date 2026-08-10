import { expect, test, type Page, type Response } from '@playwright/test'

const enabled = process.env.ENGINE_PROCESS_ACCOUNT_DELETION_E2E === '1'
const terminalBaseUrl = process.env.ENGINE_PROCESS_TERMINAL_BASE_URL || 'http://127.0.0.1:15173'
const testEmail = process.env.ENGINE_PROCESS_TEST_EMAIL || 'replacement-qualification@trad.local'
const accountId = process.env.ENGINE_PROCESS_DELETE_ACCOUNT_ID || ''
const accountLabel = process.env.ENGINE_PROCESS_DELETE_ACCOUNT_LABEL || ''
const commandTimeoutMs = Number(process.env.ENGINE_PROCESS_COMMAND_TIMEOUT_MS || '30000')

test('deletes a flat reconciled account through its owner node', async ({ page }) => {
  test.skip(!enabled, 'signed account-deletion qualification is explicitly gated')
  test.setTimeout(2 * 60_000)
  validateConfiguration()

  await login(page)
  await page.getByRole('button', { name: 'Settings' }).click()

  const settings = page.getByTestId('user-settings-dialog')
  const account = settings.locator(`[data-account-id="${accountId}"]`)
  await expect(account).toContainText(accountLabel)

  const deletionResponse = waitForDeletionResponse(page)
  await account.getByRole('button', { name: 'Delete flat account' }).click()

  const confirmation = page.getByRole('dialog', { name: 'Delete trading account' })
  await expect(confirmation).toContainText(accountLabel)
  await expect(confirmation).toContainText(/reconcile the exchange/i)
  await confirmation.getByRole('button', { name: 'Check and delete' }).click()

  const response = await deletionResponse
  expect(response.status()).toBe(200)
  const result = (await response.json()) as { deleted?: boolean; owner_release?: string }
  expect(result).toEqual({ deleted: true, owner_release: 'completed' })

  await expect(account).toHaveCount(0)
  await expect(settings).toContainText(`Deleted ${accountLabel}.`)
  await page.reload()
  await expect(page.locator(`[data-account-id="${accountId}"]`)).toHaveCount(0)
})

function validateConfiguration(): void {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
    throw new Error('ENGINE_PROCESS_DELETE_ACCOUNT_ID must identify a disposable account')
  }
  if (!accountLabel.startsWith('delete-qualification-')) {
    throw new Error(
      'ENGINE_PROCESS_DELETE_ACCOUNT_LABEL must use the delete-qualification- safety prefix',
    )
  }
}

async function login(page: Page): Promise<void> {
  page.setDefaultTimeout(commandTimeoutMs)
  await page.setViewportSize({ width: 1600, height: 1000 })
  const login = new URL('/auth/test-login', terminalBaseUrl)
  login.searchParams.set('email', testEmail)
  login.searchParams.set('return_to', '/terminal')
  await page.goto(login.toString())
  await page.waitForURL(/\/terminal(?:\?|$)/, { timeout: 30_000 })
  await expect(page.locator('.ws-indicator-status')).toHaveText('[ready]', { timeout: 30_000 })
}

function waitForDeletionResponse(page: Page): Promise<Response> {
  const encodedLabel = encodeURIComponent(accountLabel)
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' &&
      new URL(response.url()).pathname.endsWith(`/api/accounts/${encodedLabel}`),
    { timeout: commandTimeoutMs },
  )
}
