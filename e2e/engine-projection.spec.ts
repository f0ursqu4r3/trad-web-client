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
  await expect(details.getByText('0.002112345678 USDC', { exact: true })).toBeVisible()
  await expect(details.getByText('-0.003223456789 USDC', { exact: true })).toBeVisible()
  await expect(details.getByText('stop_loss @ 1800.125', { exact: true }).first()).toBeVisible()
})

test('keeps execution identity badges in mature semantic order without duplicates', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Market Order').click()
  const row = fixture
    .getByTestId('projection-entity-tree')
    .locator('[data-node-kind="order"]')
    .first()

  const pills = await row.locator('.pill').allTextContents()
  expect(pills).toEqual(['Open', 'ETH', 'hyperliquid', 'USDC perp', '10000000...', 'testnet'])

  const protection = fixture
    .getByTestId('projection-entity-tree')
    .locator('[data-node-kind="native_protection"]')
  const protectionPills = await protection.locator('.pill').allTextContents()
  expect(protectionPills).toEqual([
    'Native Protection: Tracking',
    'ETH',
    'hyperliquid',
    'USDC perp',
    '10000000...',
    'testnet',
    '0.00420001 / 0.00420001',
  ])
})

test('loads revision-pinned history without replacing the live graph', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByRole('button', { name: 'Command filters' }).click()
  await fixture.getByRole('button', { name: /Older/ }).click()

  await expect(fixture.getByText('#40000000')).toBeVisible()
  await expect(
    fixture
      .getByTestId('projection-command-list')
      .locator('[data-command-id]')
      .getByText('Chase Order'),
  ).toBeVisible()
  await fixture.locator('[data-command-id="40000000-0000-4000-8000-000000000001"]').click()
  await expect(
    fixture.getByTestId('projection-details').getByText('insufficient margin'),
  ).toBeVisible()
})

test('command selection drives details without a device resync request', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Chase Order').click()
  await expect(fixture.getByTestId('projection-details').getByTestId('chase-details')).toBeVisible()
  await fixture
    .getByTestId('projection-entity-tree')
    .getByText('Limit Order', { exact: true })
    .click()

  const details = fixture.getByTestId('projection-details')
  await expect(details.getByText('64231.125', { exact: true })).toBeVisible()
  await expect(details.getByText('0.1', { exact: true })).toBeVisible()
  await expect(details.getByText('working', { exact: true }).first()).toBeVisible()
})

test('renders domain-specific Trailing Entry state from the projection', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Trailing Entry').click()

  const details = fixture.getByTestId('projection-details')
  await expect(details.getByTestId('trailing-entry-details')).toBeVisible()
  await expect(details.getByText('145.25', { exact: true })).toBeVisible()
  await expect(details.getByText('128', { exact: true })).toBeVisible()
  await expect(details.getByText('tracking rebound from peak', { exact: true })).toBeVisible()
})

test('renders the projection-native Trailing Entry market workspace and typed controls', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Trailing Entry').click()

  const workspace = fixture.getByTestId('engine-te-workspace')
  const chart = workspace.getByTestId('engine-te-chart')
  await expect(chart).toBeVisible()
  await expect(chart).toContainText('Recent node history · 128 trades')
  await expect(chart).toContainText('144.80')
  const details = fixture.getByTestId('projection-details')
  await expect(details.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(details.getByRole('button', { name: 'Enter Now' })).toBeVisible()
  await expect(details.getByRole('button', { name: 'Cancel Entry' })).toBeVisible()

  const takeProfitTab = chart.getByRole('button', { name: /TP 155/ })
  await expect(takeProfitTab).toBeVisible()
  await takeProfitTab.click()
  await expect(takeProfitTab).not.toBeVisible()

  await details.getByRole('button', { name: 'Edit', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Edit' })
  await expect(modal.getByLabel('Activation Price')).toHaveValue('145.25')
  await expect(modal.getByLabel('Jump Threshold (bps)')).toHaveValue('10')
  await expect(modal.getByLabel('Stop Loss Price')).toHaveValue('140')
  await modal.getByRole('button', { name: 'Back' }).click()
})

test('keeps the Trailing Entry workspace usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Trailing Entry').click()

  const chart = fixture.getByTestId('engine-te-chart')
  await expect(chart).toBeVisible()
  const bounds = await chart.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds?.width ?? 0).toBeLessThanOrEqual(390)
  expect(bounds?.height ?? 0).toBeGreaterThan(200)
})

test('right-click exposes projected actions without changing the inspected command', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  const commands = fixture.getByTestId('projection-command-list')
  const chase = commands.locator('[data-command-id]').filter({ hasText: 'Chase Order' })
  const market = commands.locator('[data-command-id]').filter({ hasText: 'Market Order' })
  await expect(chase).toHaveClass(/selected/)

  await market.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Inspect' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Close Exposure' })).toBeVisible()
  await expect(chase).toHaveClass(/selected/)
  await expect(market).not.toHaveClass(/selected/)

  await page.getByRole('menuitem', { name: 'Nickname / Color...' }).click()
  const modal = page.getByRole('dialog', { name: 'Command Nickname' })
  await modal.getByLabel('Nickname').fill('Protected ETH entry')
  await modal.getByRole('button', { name: 'Red' }).click()
  await modal.getByRole('button', { name: 'Save' }).click()
  await expect(commands.getByText('Protected ETH entry', { exact: true })).toBeVisible()
})

test('duplicates an accepted command into a fresh exact form without submitting it', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  const commands = fixture.getByTestId('projection-command-list')
  const trailing = commands.locator('[data-command-id]').filter({ hasText: 'Trailing Entry' })

  await trailing.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  const modal = page.getByRole('dialog', { name: 'Trailing Entry' })
  await expect(modal.getByLabel('Symbol')).toHaveValue('SOL')
  await expect(modal.getByLabel('Position Side')).toHaveValue('long')
  await expect(modal.getByLabel('Risk Amount')).toHaveValue('25')
  await expect(modal.getByLabel('Activation Price')).toHaveValue('145.25')
  await expect(modal.getByLabel('Jump Threshold (bps)')).toHaveValue('10')
  await expect(modal.getByLabel('Stop Loss Price')).toHaveValue('140')
  await expect(modal.getByLabel('Take Profit Price (optional)')).toHaveValue('155')
  await expect(modal.getByLabel('Hyperliquid One-Way Behavior')).toHaveValue('target_side_exposure')
  await expect(modal.getByLabel('Execution Shape')).toHaveValue('single')
  await expect(fixture.getByTestId('latest-lifecycle-intent')).toHaveText('none')
})

test('projection-native command filters combine without polling device state', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  const commands = fixture.getByTestId('projection-command-list')
  const rows = commands.locator('.command-rows')
  await fixture.getByRole('button', { name: 'Command filters' }).click()
  const filters = commands.getByTestId('projection-command-filters')

  await filters.getByRole('button', { name: 'succeeded', exact: true }).click()
  await expect(rows.getByText('Market Order', { exact: true })).toBeVisible()
  await expect(rows.getByText('Chase Order', { exact: true })).not.toBeVisible()

  await filters.getByRole('button', { name: 'Reset' }).click()
  await filters.getByRole('button', { name: 'BTC' }).click()
  await expect(rows.getByText('Chase Order', { exact: true })).toBeVisible()
  await expect(rows.getByText('Market Order', { exact: true })).not.toBeVisible()
})

test('refreshes account reconciliation and follows projected completion', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  const control = fixture.getByTestId('reconciliation-control')
  await expect(control).toContainText('reconciled')

  await control.getByTestId('refresh-reconciliation').click()

  await expect(control).toContainText('reconciling')
  await expect(control).toContainText('reconciled')
})

test('inspects authoritative account positions and pre-fills typed flatten controls', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByRole('button', { name: 'Inspect account positions' }).click()

  const inspector = page.getByTestId('account-position-inspector')
  await expect(inspector).toBeVisible()
  await expect(inspector.getByText('connected', { exact: true })).toBeVisible()
  const eth = inspector.locator('[data-symbol="ETH"]')
  await expect(eth.getByText('0.00420001', { exact: true }).first()).toBeVisible()

  await eth.getByRole('button', { name: 'Flatten symbol' }).click()
  const flatten = page.getByRole('dialog', { name: 'Flatten Exposure' })
  await expect(flatten.getByRole('combobox', { name: 'Target' })).toHaveValue('symbol')
  await expect(flatten.getByRole('textbox', { name: 'Symbol' })).toHaveValue('ETH')
  await flatten.getByRole('button', { name: 'Cancel' }).click()

  await eth.getByRole('button', { name: 'scope-filled' }).click()
  await expect(page.getByTestId('account-position-inspector')).not.toBeVisible()
  await expect(fixture.getByTestId('projection-details').getByTestId('order-details')).toBeVisible()
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

test('submits an exact reduce-only Chase policy for owned exposure', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Chase Order').click()
  await fixture
    .getByTestId('projection-actions')
    .getByRole('button', { name: 'Close Exposure' })
    .click()

  const modal = page.getByRole('dialog', { name: 'Close Exposure' })
  await modal.getByLabel('Execution').selectOption('chase')
  await modal.getByLabel('Maximum Distance').fill('25.5')
  await modal.getByLabel('Expiry (minutes)').fill('3')
  await modal.getByLabel('Confirm close exposure').check()
  await modal.getByRole('button', { name: 'Close Exposure' }).click()

  await expect(modal).not.toBeVisible()
  const evidence = fixture.getByTestId('latest-lifecycle-intent')
  await expect(evidence).toContainText('"kind":"close_exposure"')
  await expect(evidence).toContainText('"kind":"chase"')
  await expect(evidence).toContainText('"kind":"basis_points","value":"25.5"')
  await expect(evidence).toContainText('"expires_after_ms":180000')
  await expect(evidence).toContainText('"quantity":{"kind":"full"}')
})

test('sizes a partial close from authoritative owned exposure inside the modal', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Market Order').click()
  await fixture
    .getByTestId('projection-actions')
    .getByRole('button', { name: 'Close Exposure' })
    .click()

  const modal = page.getByRole('dialog', { name: 'Close Exposure' })
  const context = modal.getByTestId('close-exposure-context')
  await expect(context).toContainText('ETH · long · 0.00420001 ETH')
  await modal.getByLabel('Close Amount').selectOption('percent')
  await modal.getByLabel('Close Percentage (%)').fill('0')
  await expect(modal.getByText('Close amount must be greater than zero.')).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Close Exposure' })).toBeDisabled()
  await modal.getByRole('button', { name: '50%' }).click()
  await expect(context).toContainText('0.002100005 ETH')
  await expect(context).toContainText('0.002100005 ETH')
  await modal.getByLabel('Confirm close exposure').check()
  await modal.getByRole('button', { name: 'Close Exposure' }).click()

  await expect(fixture.getByTestId('latest-lifecycle-intent')).toContainText(
    '"quantity":{"kind":"base","quantity":"0.002100005"}',
  )
})

test('edits logical native protection without exposing exchange order identity', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Market Order').click()
  await fixture
    .getByTestId('projection-entity-tree')
    .locator('[data-node-kind="native_protection"]')
    .click()
  await fixture
    .getByTestId('projection-protection-actions')
    .getByRole('button', { name: 'Edit Protection' })
    .click()

  const modal = page.getByRole('dialog', { name: 'Edit Native Protection' })
  await expect(modal.getByText('Plan revision 4')).toBeVisible()
  await expect(modal.getByText('Mark Price').first()).toBeVisible()
  await modal.getByLabel('TP 1 Trigger').fill('2110.5000')
  await modal.getByLabel(/Apply this complete TP\/SL plan/).check()
  await modal.getByRole('button', { name: 'Apply Protection' }).click()

  await expect(modal).not.toBeVisible()
  const evidence = fixture.getByTestId('latest-lifecycle-intent')
  await expect(evidence).toContainText('"kind":"amend_protection"')
  await expect(evidence).toContainText('"expected_plan_revision":4')
  await expect(evidence).toContainText('"child_id":"30000000-0000-4000-8000-000000000004"')
  await expect(evidence).toContainText('"trigger_price":"2110.5000"')
  await expect(evidence).not.toContainText('native-take-profit-remote')
})

test('opens protection from its owning execution relationship', async ({ page }) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Market Order').click()
  const protection = fixture
    .getByTestId('projection-entity-tree')
    .locator('[data-node-kind="native_protection"]')
  await expect(protection).toContainText('Native Protection')
  await expect(protection).toContainText('0.00420001 / 0.00420001')
  await protection.click()

  const details = fixture.getByTestId('projection-details')
  await expect(details.getByText('Native Protection', { exact: true })).toBeVisible()
  await expect(details.getByText('tracking', { exact: true })).toHaveCount(1)
  await details.getByRole('button', { name: 'Edit Protection' }).click()

  const modal = page.getByRole('dialog', { name: 'Edit Native Protection' })
  await expect(modal.getByText('Plan revision 4')).toBeVisible()
  await modal.getByRole('button', { name: 'Back' }).click()
  await expect(modal).not.toBeVisible()
})

test('inspects an individual protection child without exposing it as a command', async ({
  page,
}) => {
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByTestId('projection-command-list').getByText('Market Order').click()

  const takeProfit = fixture
    .getByTestId('projection-entity-tree')
    .locator('[data-node-kind="protection_child"]')
    .filter({ hasText: 'Take Profit' })
  await expect(takeProfit).toContainText('2100.125')
  await takeProfit.click()

  const details = fixture.getByTestId('projection-details')
  await expect(details.getByText('Protection Order', { exact: true }).first()).toBeVisible()
  await expect(details.getByText('take profit', { exact: true })).toBeVisible()
  await expect(details.getByText('2,100.125', { exact: true })).toBeVisible()
  await expect(details.getByText('0.002100005', { exact: true }).first()).toBeVisible()
  await expect(details.getByText('Exchange evidence (1)', { exact: true })).toBeVisible()
})
