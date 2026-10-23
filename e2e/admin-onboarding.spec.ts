import { expect, test, type Page } from '@playwright/test'
import { mockGateway } from './support/mockGateway'

// Operator onboarding in Users & access against a mocked Gateway: invite,
// enable/disable and the cell field.

const ADMIN_ID = '20000000-0000-4000-8000-000000000001'
const TRADER_ID = '20000000-0000-4000-8000-000000000002'
const INVITED_ID = '20000000-0000-4000-8000-000000000003'

function adminUser(id: string, email: string, extra: Record<string, unknown> = {}) {
  return {
    user_id: id,
    email,
    role: 'user',
    enabled: true,
    entitlement_override: null,
    builder_target_override_tenths_bps: null,
    subscription_status: null,
    entitled: true,
    entitlement_source: 'complimentary_grant',
    plan_key: 'private_beta',
    plan_version: 1,
    account_count: 0,
    created_at: '2026-10-01T00:00:00Z',
    last_login_at: null,
    cell_id: null,
    ...extra,
  }
}

async function openUsersAdmin(page: Page) {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await mockGateway(page, { authenticated: true })
  const users = [
    adminUser(ADMIN_ID, 'operator@example.com', { role: 'super_admin' }),
    adminUser(TRADER_ID, 'trader@example.com', { cell_id: 'krio', account_count: 1 }),
  ]
  const writes: { method: string; path: string; body: unknown }[] = []
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        email: 'operator@example.com',
        user_id: ADMIN_ID,
        entitled: true,
        enabled: true,
        role: 'super_admin',
        capabilities: ['admin', 'manage_super_admins'],
        client_profile: { display_name: null, meta: { preferences: {} } },
        accounts: [],
      },
    }),
  )
  await page.route('**/api/admin/users', (route) => {
    const request = route.request()
    if (request.method() === 'GET') return route.fulfill({ json: users })
    const body = request.postDataJSON() as { email: string; cell_id?: string }
    writes.push({ method: 'POST', path: '/admin/users', body })
    const existing = users.find((user) => user.email === body.email)
    if (existing) {
      return route.fulfill({
        status: 409,
        json: {
          error: 'a user with this email already exists',
          code: 'user_exists',
          user_id: existing.user_id,
        },
      })
    }
    users.push(adminUser(INVITED_ID, body.email, { cell_id: body.cell_id ?? null }))
    return route.fulfill({ status: 201, json: { user_id: INVITED_ID, grant_id: 'g-1' } })
  })
  await page.route('**/api/admin/users/*/enabled', (route) => {
    const id = route.request().url().split('/').at(-2) ?? ''
    const body = route.request().postDataJSON() as { enabled: boolean }
    writes.push({ method: 'PUT', path: `/admin/users/${id}/enabled`, body })
    if (id === INVITED_ID && !body.enabled) {
      return route.fulfill({
        status: 403,
        json: { error: 'only a super administrator can disable a super administrator' },
      })
    }
    const user = users.find((entry) => entry.user_id === id)
    if (user) user.enabled = body.enabled
    return route.fulfill({
      json: { role: 'user', enabled: body.enabled, entitlement_override: null },
    })
  })
  await page.route('**/api/admin/users/*/cell', (route) => {
    const id = route.request().url().split('/').at(-2) ?? ''
    const body = route.request().postDataJSON() as { cell_id: string | null }
    writes.push({ method: 'PUT', path: `/admin/users/${id}/cell`, body })
    return route.fulfill({ json: { user_id: id, cell_id: body.cell_id } })
  })
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Users & access' })).toBeVisible()
  return { writes, pageErrors }
}

test('an admin invites a user and sees a second invitation refused plainly', async ({ page }) => {
  const { writes, pageErrors } = await openUsersAdmin(page)
  const form = page.getByTestId('admin-invite-form')
  const invite = form.getByRole('button', { name: 'Invite' })
  await expect(invite).toBeDisabled()

  await form.getByLabel('Email').fill('new@example.com')
  await form.getByLabel('Cell').fill('Bad/Cell')
  await form.getByLabel('Cell').press('Tab')
  await expect(page.getByText(/A cell is 1-32 lowercase letters/)).toBeVisible()
  await expect(invite).toBeDisabled()
  await form.getByLabel('Cell').fill('cell-2')
  await invite.click()
  await expect(page.getByText('Invited new@example.com. They can sign in now.')).toBeVisible()
  expect(writes.at(-1)).toEqual({
    method: 'POST',
    path: '/admin/users',
    body: { email: 'new@example.com', cell_id: 'cell-2' },
  })
  const table = page.getByTestId('admin-user-table')
  await expect(table.getByRole('row').filter({ hasText: 'new@example.com' })).toBeVisible()

  await form.getByLabel('Email').fill('trader@example.com')
  await invite.click()
  const refusal = page.getByRole('alert').filter({ hasText: 'already exists' })
  await expect(refusal).toContainText('A user with this email already exists.')
  await expect(refusal.getByRole('link', { name: 'Open that user' })).toHaveAttribute(
    'href',
    `/admin/users/${TRADER_ID}`,
  )
  await page.screenshot({ path: 'test-results/admin-invite.png', fullPage: true })
  expect(pageErrors).toEqual([])
})

test('an admin toggles access and records a cell without a confirmation', async ({ page }) => {
  const { writes, pageErrors } = await openUsersAdmin(page)
  const table = page.getByTestId('admin-user-table')
  const trader = table.getByRole('row').filter({ hasText: 'trader@example.com' })
  const self = table.getByRole('row').filter({ hasText: 'operator@example.com' })

  const selfEnabled = self.getByRole('checkbox', { name: 'operator@example.com enabled' })
  await expect(selfEnabled).toBeDisabled()
  await expect(selfEnabled).toBeChecked()

  const enabled = trader.getByRole('checkbox', { name: 'trader@example.com enabled' })
  await expect(enabled).toBeChecked()
  await enabled.uncheck()
  await expect(trader.getByText('Disabled', { exact: true })).toBeVisible()
  await expect(enabled).not.toBeChecked()
  expect(writes.at(-1)).toEqual({
    method: 'PUT',
    path: `/admin/users/${TRADER_ID}/enabled`,
    body: { enabled: false },
  })
  await enabled.check()
  await expect(trader.getByText('Enabled', { exact: true })).toBeVisible()

  const cell = trader.getByRole('textbox', { name: 'Cell for trader@example.com' })
  await expect(cell).toHaveValue('krio')
  await cell.fill('cell-3')
  await cell.press('Enter')
  await expect(trader.getByRole('button', { name: 'Set' })).toHaveCount(0)
  expect(writes.at(-1)).toEqual({
    method: 'PUT',
    path: `/admin/users/${TRADER_ID}/cell`,
    body: { cell_id: 'cell-3' },
  })
  await cell.fill('')
  await trader.getByRole('button', { name: 'Set' }).click()
  await expect(trader.getByRole('button', { name: 'Set' })).toHaveCount(0)
  expect(writes.at(-1)?.body).toEqual({ cell_id: null })

  await cell.fill('-x')
  await expect(trader.getByRole('alert')).toContainText('A cell is 1-32 lowercase letters')
  await expect(trader.getByRole('button', { name: 'Set' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/admin-users-onboarding.png', fullPage: true })
  expect(pageErrors).toEqual([])
})

test('a refused disable keeps the user enabled and shows the server reason', async ({ page }) => {
  const { pageErrors } = await openUsersAdmin(page)
  const form = page.getByTestId('admin-invite-form')
  await form.getByLabel('Email').fill('boss@example.com')
  await form.getByRole('button', { name: 'Invite' }).click()
  const row = page.getByTestId('admin-user-table').getByRole('row').filter({
    hasText: 'boss@example.com',
  })
  const enabled = row.getByRole('checkbox', { name: 'boss@example.com enabled' })
  await enabled.uncheck()
  await expect(row.getByRole('alert')).toHaveText(
    'Only a super administrator can disable a super administrator.',
  )
  await expect(enabled).toBeChecked()
  await expect(row.getByText('Enabled', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})
