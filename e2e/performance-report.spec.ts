import { expect, test } from './support/test'

// The performance report is public: it renders signed out, with its own
// chrome, and the Updates page links to it.
test.beforeEach(async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
})

test('renders signed out with its sections, figures and head tags', async ({ page }) => {
  await page.goto('/reports/performance-2026-10')
  await expect(page).toHaveURL(/\/reports\/performance-2026-10$/)
  await expect(page.getByRole('heading', { name: 'Performance report' })).toBeVisible()
  for (const title of [
    'Engine turn latency',
    'Process memory',
    'Startup and failover',
    'Order path latency',
    'Client load',
    'Bandwidth',
    'Exchange rate limits',
    'Deploy pause',
    'Verification throughput',
    'Not measured',
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible()
  }
  const largeCommand = page.locator('#engine-turns tbody tr').nth(7)
  await expect(largeCommand).toContainText('55.7 ms')
  await expect(largeCommand).toContainText('41 µs')
  await expect(largeCommand).toContainText('1,360x')
  await expect(
    page.getByRole('img', { name: /Trading pause per production release/ }),
  ).toBeVisible()
  await expect(page).toHaveTitle('Trad performance report — Aug–Oct 2026')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    /\/reports\/performance-2026-10\/$/,
  )
  await expect(page.locator('body')).not.toContainText(/krio|stevejobs/i)
})

test('fits a phone: only the tables scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/reports/performance-2026-10')
  await expect(page.getByText('Engine turn latency', { exact: true })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

test('the Updates page links to the report', async ({ page }) => {
  await page.goto('/e2e/release-notes')
  await expect(page.getByRole('link', { name: 'Performance report' })).toHaveAttribute(
    'href',
    '/reports/performance-2026-10',
  )
})
