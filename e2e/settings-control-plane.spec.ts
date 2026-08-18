import { expect, test } from '@playwright/test'

test('settings and administrator control plane are navigable', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fsettings%2Fprofile')
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText('668es218pur@gmail.com')).toBeVisible()

  await page.getByRole('link', { name: 'Trading accounts' }).click()
  await expect(page.getByRole('heading', { name: 'Trading accounts' })).toBeVisible()
  await expect(page.getByText('tester', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Authorization & fees' }).click()
  await expect(page.getByRole('heading', { name: 'Authorization & fees' })).toBeVisible()
  await expect(page.getByText('Agent wallet', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Users & access' }).click()
  await expect(page.getByRole('heading', { name: 'Users & access' })).toBeVisible()
  await expect(page.getByText('kriocrypto@gmail.com')).toBeVisible()

  await page.getByRole('link', { name: 'Execution policy' }).click()
  await expect(page.getByRole('heading', { name: 'Execution policy' })).toBeVisible()
  await expect(page.getByText('10.0 bps / 0.100%')).toBeVisible()

  await page.screenshot({ path: 'test-results/settings-control-plane.png', fullPage: true })
  expect(pageErrors).toEqual([])
})
