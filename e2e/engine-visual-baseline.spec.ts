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
  await page.goto('/e2e/engine-projection')
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' })
  await expect(page.getByTestId('engine-projection-fixture')).toBeVisible()
}

test('A1 projection terminal preserves mature density and hierarchy', async ({ page }) => {
  await openFixture(page)
  await expect(page).toHaveScreenshot('a1-projection-terminal.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('A1 selected Trailing Entry preserves chart and details hierarchy', async ({ page }) => {
  await openFixture(page)
  await page.getByTestId('projection-command-list').getByText('Trailing Entry').click()
  await expect(page.getByTestId('engine-te-chart')).toBeVisible()
  await expect(page.getByTestId('trailing-entry-details')).toBeVisible()
  await expect(page).toHaveScreenshot('a1-projection-trailing-entry.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('A1 selected Trailing Entry remains usable at a narrow viewport', async ({ page }) => {
  await openFixture(page, { width: 720, height: 900 })
  await page.getByTestId('projection-command-list').getByText('Trailing Entry').click()
  await expect(page.getByTestId('engine-te-chart')).toBeVisible()
  await expect(page).toHaveScreenshot('a1-projection-trailing-entry-narrow.png', {
    animations: 'disabled',
    fullPage: true,
  })
})
