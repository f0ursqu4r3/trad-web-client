import { expect, test, type Page } from '@playwright/test'

async function openFixture(
  page: Page,
  viewport = { width: 1680, height: 940 },
  colorScheme: 'light' | 'dark' = 'light',
) {
  await page.setViewportSize(viewport)
  await page.emulateMedia({ colorScheme })
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

test('A1 projection terminal preserves mature dark density and hierarchy', async ({ page }) => {
  await openFixture(page, { width: 1680, height: 940 }, 'dark')
  await expect(page).toHaveScreenshot('a1-projection-terminal-dark.png', {
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

test('A1 Native Protection preserves one dense lifecycle presentation', async ({ page }) => {
  await openFixture(page, { width: 1680, height: 940 }, 'dark')
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Market Order').click()
  await fixture
    .getByTestId('projection-entity-tree')
    .locator('[data-node-kind="native_protection"]')
    .click()

  const details = fixture.getByTestId('projection-details')
  await expect(details.getByText('tracking', { exact: true })).toHaveCount(1)
  await expect(page).toHaveScreenshot('a1-native-protection.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('A1 Native Protection edit keeps readable aligned controls', async ({ page }) => {
  await openFixture(page, { width: 1680, height: 940 }, 'dark')
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Market Order').click()
  await fixture
    .getByTestId('projection-entity-tree')
    .locator('[data-node-kind="native_protection"]')
    .click()
  await fixture.getByRole('button', { name: 'Edit Protection' }).click()

  const modal = page.getByRole('dialog', { name: 'Edit Native Protection' })
  await expect(modal).toBeVisible()
  await expect(modal).toHaveScreenshot('a1-native-protection-edit.png', {
    animations: 'disabled',
  })
})
