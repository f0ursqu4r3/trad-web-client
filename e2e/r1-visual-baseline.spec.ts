import { expect, test, type Page } from '@playwright/test'

async function openFixture(page: Page, viewport = { width: 1680, height: 940 }) {
  await page.setViewportSize(viewport)
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
  await page.route(/https:\/\/api\.hyperliquid(?:-testnet)?\.xyz\/info/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ BTC: '64100', ETH: '3100', SOL: '180' }),
    })
  })
  await page.goto('/e2e/bybit-terminal')
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' })
  await expect(page.getByTestId('command-panel')).toBeVisible()
  await page.waitForTimeout(500)
}

test('R1 terminal density and hierarchy', async ({ page }) => {
  await openFixture(page)

  await expect(page).toHaveScreenshot('r1-terminal-density.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('R1 selected trailing-entry graph and device details', async ({ page }) => {
  await openFixture(page)

  const command = page
    .getByTestId('command-panel')
    .locator('.command-row')
    .filter({ hasText: 'Hyperliquid ETH ownership conflict' })
  await command.click()
  await expect(page.getByTestId('device-tree-panel').getByText('Trailing Entry').first()).toBeVisible()
  await page.getByTestId('device-tree-panel').getByText('Trailing Entry').first().click()
  await expect(page.getByTestId('device-details-panel').getByText('Trailing Entry Device')).toBeVisible()

  await expect(page).toHaveScreenshot('r1-trailing-entry-selected.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('R1 protected market-order form', async ({ page }) => {
  await openFixture(page)
  await page.getByTestId('open-hyperliquid-mo').click()
  await expect(page.getByRole('dialog', { name: 'Market Order' })).toBeVisible()
  await page.waitForTimeout(500)

  await expect(page).toHaveScreenshot('r1-market-order-form.png', {
    animations: 'disabled',
    fullPage: true,
    mask: [
      page.locator('[aria-label="Hyperliquid position effect"] .grid span:last-of-type'),
    ],
  })
})

test('R1 trailing-entry form', async ({ page }) => {
  await openFixture(page)
  await page.getByTestId('open-hyperliquid-te').click()
  await expect(page.getByRole('dialog', { name: 'Trailing Entry' })).toBeVisible()
  await page.waitForTimeout(500)

  await expect(page).toHaveScreenshot('r1-trailing-entry-form.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('R1 account positions and reconciliation surface', async ({ page }) => {
  await openFixture(page)
  const accounts = page.getByTestId('accounts-panel')
  await accounts.getByRole('button', { name: /Hyperliquid QA/ }).click()
  await accounts.getByRole('button', { name: 'Positions' }).click()
  await expect(page.getByRole('dialog', { name: /Hyperliquid Positions/ })).toBeVisible()

  await expect(page).toHaveScreenshot('r1-account-positions.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('R1 market form remains usable at a narrow viewport', async ({ page }) => {
  await openFixture(page, { width: 720, height: 900 })
  await page.getByTestId('open-hyperliquid-mo').click()
  const dialog = page.getByRole('dialog', { name: 'Market Order' })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(500)

  await expect(dialog).toHaveScreenshot('r1-market-order-narrow.png', {
    animations: 'disabled',
    mask: [
      dialog.locator('[aria-label="Hyperliquid position effect"] .grid span:last-of-type'),
    ],
  })
})
