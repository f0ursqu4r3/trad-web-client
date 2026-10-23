import { expect, test } from './support/test'
import { visibleProductReleases } from '../src/lib/releases'

// The e2e server is Vite dev, where drafts are visible too. Each visible
// release renders one "Fixes" section heading under the Fixes filter.
const visibleReleaseCount = visibleProductReleases(true).length

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
  await expect(page.getByRole('link', { name: 'Trad 0.10.9' })).toHaveAttribute(
    'href',
    '/updates/0.10.9/',
  )
  await expect(page.getByRole('heading', { name: 'Trad 0.10.9' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.13' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.15' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.16' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.17' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.18' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.31' })).toBeVisible()
  await expect(page.getByText('Protection recovery and live P&L', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Account capacity and market visibility', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trad 0.10.5' })).toHaveAttribute(
    'href',
    '/updates/0.10.5/',
  )
  await expect(page.getByRole('heading', { name: 'Trad 0.10.5' })).toBeVisible()
  await expect(page.getByText('Lifecycle safety', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.10.0' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Trad 0.9.0' })).toBeVisible()
  await expect(page.getByText('Beta', { exact: true })).toBeVisible()
  const lifecycleRelease = page.getByRole('article').filter({ hasText: 'Trad 0.10.5' })
  await lifecycleRelease.locator('summary').click()
  await expect(page.getByText('Multi-venue state-machine campaign', { exact: true })).toBeVisible()
  await expect(page.getByText('Account removal fencing', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Fixes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fixes', exact: true })).toHaveCount(
    visibleReleaseCount,
  )
  await expect(page.getByRole('heading', { name: 'Major', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Minor', exact: true })).toHaveCount(0)
  await expect(page.getByText('Account removal fencing', { exact: true })).toBeVisible()
  await expect(page.getByText('Multi-venue state-machine campaign', { exact: true })).toHaveCount(0)
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
