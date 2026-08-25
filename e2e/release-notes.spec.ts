import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
  await page.goto('/e2e/release-notes')
})

test('lists published releases and filters their categories', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Patch notes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Updates' })).toHaveClass(/active/)
  await expect(page.getByRole('link', { name: 'v0.10.1' })).toHaveAttribute(
    'href',
    '/updates/0.10.1/',
  )
  await expect(page.getByRole('heading', { name: 'Trad 0.10.1' })).toBeVisible()
  await expect(page.getByText('Test cluster', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('heading', { name: 'Trad 0.10.0' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.9.0' })).toBeVisible()
  await expect(page.getByText('Beta', { exact: true })).toBeVisible()
  await expect(page.getByText('Chase protection controller', { exact: true })).toBeVisible()
  await expect(page.getByText('All-in fee policy and revenue', { exact: true })).toBeVisible()
  await expect(
    page.getByText("Reproduced the client's BTC sequence", { exact: false }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Fixes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fixes', exact: true })).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Major', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Minor', exact: true })).toHaveCount(0)
  await expect(page.getByText('Incident repairs', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Precision, reporting, and density fixes', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Trade-scoped economics and risk', { exact: true })).toHaveCount(0)
})

test('opens a stable release permalink with release-specific metadata', async ({ page }) => {
  await page.goto('/e2e/release-notes/0.10.0')

  await expect(page).toHaveTitle('Trad 0.10.0 — Patch notes')
  await expect(page.getByRole('heading', { name: 'Trad 0.10.0' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.1' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'All updates' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trad 0.10.0' })).toHaveAttribute(
    'href',
    '/updates/0.10.0/',
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/update-previews\/0\.10\.0\.png$/,
  )
})
