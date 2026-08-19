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
  const accountRow = page
    .getByTestId('account-settings-index')
    .getByRole('row')
    .filter({ hasText: 'tester' })
  await expect(accountRow).toHaveCSS('--account-context-color', /.+/)
  await expect(accountRow.getByRole('cell').first()).toHaveCSS('vertical-align', 'middle')
  await accountRow.getByRole('link', { name: /Manage|Set up/ }).click()
  await expect(page).toHaveURL(/\/settings\/accounts\/[^/]+\/(overview|setup)$/)
  await expect(page.getByRole('navigation', { name: 'Account management' })).toBeVisible()
  await page.getByRole('link', { name: 'Authorization', exact: true }).click()
  await expect(page).toHaveURL(/\/authorization$/)
  await expect(page.getByText('Builder Address', { exact: true })).toBeVisible()
  await expect(page.getByText('Wallet approval ceiling', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve 10.0 bps' })).toBeVisible()
  await expect(page.getByText(/Current Trad target total:/)).toBeVisible()
  await page.getByRole('link', { name: 'All accounts' }).click()

  await page.getByRole('link', { name: 'Authorization & fees' }).click()
  await expect(page.getByRole('heading', { name: 'Authorization & fees' })).toBeVisible()
  await expect(page.getByText('Agent wallet', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Billing', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  await expect(page.getByText('Private beta', { exact: true })).toBeVisible()
  await expect(page.getByText('Invoices', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Users & access' }).click()
  await expect(page.getByRole('heading', { name: 'Users & access' })).toBeVisible()
  await expect(page.getByText('kriocrypto@gmail.com')).toBeVisible()

  await page.getByRole('link', { name: 'Execution policy' }).click()
  await expect(page.getByRole('heading', { name: 'Execution policy' })).toBeVisible()
  await expect(page.getByText('10.0 bps / 0.100%')).toBeVisible()

  await page.getByRole('link', { name: 'Plans & billing' }).click()
  await expect(page.getByRole('heading', { name: 'Plans & billing' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Private beta' })).toBeVisible()

  await page.screenshot({ path: 'test-results/settings-control-plane.png', fullPage: true })
  expect(pageErrors).toEqual([])
})

test('super-admin role controls are capability-scoped', async ({ page }) => {
  await page.goto('/auth/test-login?email=668es218pur%40gmail.com&return_to=%2Fadmin%2Fusers')
  const table = page.getByTestId('admin-user-table')
  const owner = table.getByRole('row').filter({ hasText: '668es218pur@gmail.com' })
  const delegatedAdmin = table.getByRole('row').filter({ hasText: 'kriocrypto@gmail.com' })
  await expect(owner.locator('select').first()).toHaveValue('super_admin')
  await expect(owner.locator('select').first()).toBeDisabled()
  await expect(delegatedAdmin.locator('select').first()).toHaveValue('admin')
  await expect(
    delegatedAdmin.locator('select').first().locator('option[value="super_admin"]'),
  ).toHaveCount(1)

  await page.goto('/auth/test-login?email=kriocrypto%40gmail.com&return_to=%2Fadmin%2Fusers')
  const adminTable = page.getByTestId('admin-user-table')
  const protectedOwner = adminTable.getByRole('row').filter({ hasText: '668es218pur@gmail.com' })
  const ordinaryUser = adminTable.getByRole('row').filter({ hasText: 'client-test@trad.local' })
  await expect(protectedOwner.locator('select').first()).toHaveValue('super_admin')
  await expect(protectedOwner.locator('select').first()).toBeDisabled()
  await expect(protectedOwner.getByRole('button', { name: 'Save' })).toBeDisabled()
  await expect(
    ordinaryUser.locator('select').first().locator('option[value="super_admin"]'),
  ).toHaveCount(0)
})
