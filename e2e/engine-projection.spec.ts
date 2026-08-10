import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
  await page.goto('/e2e/engine-projection')
})

test('renders the typed command graph and exact execution evidence', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  const commands = fixture.getByTestId('projection-command-list')
  const details = fixture.getByTestId('projection-details')
  await expect(commands.getByText('Chase Order')).toBeVisible()
  await expect(commands.getByText('Market Order')).toBeVisible()

  const tree = fixture.getByTestId('projection-entity-tree')
  await expect(tree.getByText('Chase', { exact: true })).toBeVisible()
  await expect(tree.getByText('Limit Order', { exact: true })).toBeVisible()

  await commands.getByText('Market Order', { exact: true }).click()
  await tree.locator('[data-node-kind="order"]').getByText('Market Order', { exact: true }).click()
  await expect(details.getByText('0.00420001', { exact: true }).first()).toBeVisible()
  await expect(details.getByText('0.00420001 @ 1918.90000001', { exact: true })).toBeVisible()
  await expect(details.getByText('Fee 0.003223456789 USDC', { exact: true })).toBeVisible()
  await expect(details.getByText('stop_loss @ 1800.125', { exact: true })).toBeVisible()
})

test('loads revision-pinned history without replacing the live graph', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByRole('button', { name: /Older/ }).click()

  await expect(fixture.getByText('#40000000')).toBeVisible()
  await expect(
    fixture.getByTestId('projection-command-list').getByText('Chase Order'),
  ).toBeVisible()
  await fixture.getByText('#40000000').click()
  await expect(
    fixture.getByTestId('projection-details').getByText('insufficient margin'),
  ).toBeVisible()
})

test('command selection drives details without a device resync request', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Chase Order').click()
  await fixture
    .getByTestId('projection-entity-tree')
    .getByText('Limit Order', { exact: true })
    .click()

  const details = fixture.getByTestId('projection-details')
  await expect(details.getByText('64231.125', { exact: true })).toBeVisible()
  await expect(details.getByText('0.1', { exact: true })).toBeVisible()
  await expect(details.getByText('working', { exact: true }).first()).toBeVisible()
})

test('refreshes account reconciliation and follows projected completion', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  const control = fixture.getByTestId('reconciliation-control')
  await expect(control).toContainText('reconciled')

  await control.getByTestId('refresh-reconciliation').click()

  await expect(control).toContainText('reconciling')
  await expect(control).toContainText('reconciled')
})

test('submits projected lifecycle actions with authoritative entity identity', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Chase Order').click()
  await fixture
    .getByTestId('projection-actions')
    .getByRole('button', { name: 'Cancel Chase' })
    .click()

  const modal = page.getByRole('dialog', { name: 'Cancel Chase' })
  await modal.getByLabel('Confirm cancel chase').check()
  await modal.getByRole('button', { name: 'Cancel Chase' }).click()
  await expect(modal).not.toBeVisible()
  await expect(fixture.getByTestId('latest-lifecycle-intent')).toContainText(
    '"kind":"cancel_chase"',
  )
  await expect(fixture.getByTestId('latest-lifecycle-intent')).toContainText(
    '"chase_id":"20000000-0000-4000-8000-000000000002"',
  )
})
