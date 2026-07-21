import { expect, test } from '@playwright/test'

test('Bybit command and device filters are explicit, not selected-account scoped', async ({
  page,
}) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const commandPanel = page.getByTestId('command-panel')
  const devicePanel = page.getByTestId('device-tree-panel')
  const deviceRows = devicePanel.locator('.device-row')

  await expect(commandPanel.getByText('Bybit BTC native TP/SL')).toBeVisible()
  await expect(commandPanel.getByText('Binance ETH legacy')).toBeVisible()
  await expect(deviceRows.filter({ hasText: 'Native Protection' }).first()).toBeVisible()
  await expect(deviceRows.filter({ hasText: 'Market Order' }).first()).toBeVisible()

  await commandPanel.getByRole('button', { name: 'Bybit', exact: true }).click()

  await expect(commandPanel.getByText('Bybit BTC native TP/SL')).toBeVisible()
  await expect(commandPanel.getByText('Binance ETH legacy')).toHaveCount(0)

  await commandPanel.getByRole('button', { name: 'Bybit', exact: true }).click()
  await expect(commandPanel.getByText('Binance ETH legacy')).toBeVisible()

  await devicePanel.getByRole('button', { name: 'Bybit', exact: true }).click()

  await expect(deviceRows.filter({ hasText: 'Native Protection' }).first()).toBeVisible()
  await expect(deviceRows.filter({ hasText: 'Bybit' }).first()).toBeVisible()
  await expect(deviceRows.filter({ hasText: 'Binance' })).toHaveCount(0)
})

test('Bybit account panel renders order queue telemetry', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const accountPanel = page.getByTestId('accounts-panel')

  await expect(accountPanel.getByText('Bybit QA')).toBeVisible()
  await expect(accountPanel.getByText('DOGEUSDT L/S 2x / 3x')).toBeVisible()
  await expect(accountPanel.getByText('ETHUSDT L/S ? / 1x')).toBeVisible()
  await expect(accountPanel.getByText('unknown MISSINGUSDT')).toBeVisible()
  await expect(accountPanel.getByText('20 queued / 5 live')).toBeVisible()
  await expect(accountPanel.getByText('8.5s')).toBeVisible()
  await expect(accountPanel.getByText('4.0s')).toBeVisible()
  await expect(accountPanel.getByText('2 err / 3 cancel')).toBeVisible()
  await expect(accountPanel.getByText('1', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('4', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('16', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('0/10')).toBeVisible()
  await expect(accountPanel.getByText('hold 2.5s')).toBeVisible()
})

test('Hyperliquid account panel renders exchange-keyed queue telemetry', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()

  await expect(accountPanel.getByText('Hyperliquid QA')).toBeVisible()
  await expect(accountPanel.getByText('USDC perp')).toBeVisible()
  await expect(accountPanel.getByText('7 queued / 2 live')).toBeVisible()
  await expect(accountPanel.getByText('12s')).toBeVisible()
  await expect(accountPanel.getByText('6.0s')).toBeVisible()
  await expect(accountPanel.getByText('5 err / 1 cancel')).toBeVisible()
  await expect(accountPanel.getByText('6', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('8', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('9', { exact: true })).toBeVisible()
})

test('Bybit terminal remains inspectable with many active TE rows', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const commandPanel = page.getByTestId('command-panel')
  const devicePanel = page.getByTestId('device-tree-panel')
  const detailsPanel = page.getByTestId('device-details-panel')
  const deviceRows = devicePanel.locator('.device-row')

  await expect(commandPanel.getByText('Bybit missed BTC entry')).toBeVisible()
  await expect(deviceRows.filter({ hasText: 'Trailing Entry' })).toHaveCount(51)

  await devicePanel.getByRole('button', { name: 'Bybit', exact: true }).click()
  await expect(deviceRows.filter({ hasText: 'Binance' })).toHaveCount(0)
  await expect(deviceRows.filter({ hasText: 'Trailing Entry' })).toHaveCount(51)

  await devicePanel.getByRole('button', { name: 'ZROUSDT', exact: true }).click()
  await expect(deviceRows.filter({ hasText: 'Trailing Entry' })).toHaveCount(1)

  const zroRow = deviceRows.filter({ hasText: 'ZROUSDT' })
  await zroRow.scrollIntoViewIfNeeded()
  await zroRow.click()

  await expect(detailsPanel.getByText('Trailing Entry Device')).toBeVisible()
  await expect(detailsPanel.getByText('ZROUSDT').first()).toBeVisible()
  await expect(detailsPanel.getByText('Risk Amount')).toBeVisible()
  await expect(detailsPanel.getByText('Running', { exact: true }).first()).toBeVisible()
})

test('Bybit rejected market order shows no-position rejection reason', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const devicePanel = page.getByTestId('device-tree-panel')
  const detailsPanel = page.getByTestId('device-details-panel')

  await devicePanel
    .locator('.device-row')
    .filter({ hasText: 'Market Order' })
    .filter({ hasText: 'ADAUSDT' })
    .click()

  await expect(detailsPanel.getByText('Market Order Device')).toBeVisible()
  await expect(detailsPanel.getByText('Rejected', { exact: true }).first()).toBeVisible()
  await expect(detailsPanel.getByText('Rejection Reason')).toBeVisible()
  await expect(detailsPanel.getByText('Bybit rejected market order before opening')).toBeVisible()
  await expect(detailsPanel.getByText('retCode=110007')).toBeVisible()
  await expect(detailsPanel.getByText('No position was established by this order.')).toBeVisible()
})

test('Bybit missing native protection is loud in device details', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const devicePanel = page.getByTestId('device-tree-panel')
  const detailsPanel = page.getByTestId('device-details-panel')

  await devicePanel.locator('.device-row').filter({ hasText: 'MISSINGUSDT' }).click()

  await expect(detailsPanel.getByText('Native Protection')).toBeVisible()
  await expect(detailsPanel.getByText('Rejected', { exact: true }).first()).toBeVisible()
  await expect(detailsPanel.getByText('Protection Summary')).toBeVisible()
  await expect(detailsPanel.getByText('Native TP/SL', { exact: true })).toBeVisible()
  await expect(detailsPanel.getByText('Native Bybit TP/SL protection missing')).toBeVisible()
  await expect(detailsPanel.getByText('native_protection_missing')).toBeVisible()
  await expect(
    detailsPanel.getByText('observed 1 linked TP/SL orders, expected 2'),
  ).toBeVisible()
})

test('Bybit account creation submits exchange credentials through account API', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  let putUrl = ''
  let putPayload: Record<string, unknown> | null = null
  let accountCreated = false
  await page.route('**/api/accounts**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST' && request.url().includes('/api/accounts/validate')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          skipped: false,
          exchange: 'bybit',
          network: 'testnet',
          present_permissions: [
            'Read account data',
            'Read orders and positions',
            'Create/cancel contract orders',
            'Withdrawals disabled',
          ],
          missing_requirements: [],
          warnings: [],
          read_only: false,
          exchange_message: 'fixture permissions ok',
        }),
      })
      return
    }
    if (request.method() === 'PUT') {
      putUrl = request.url()
      putPayload = request.postDataJSON() as Record<string, unknown>
      accountCreated = true
      await route.fulfill({
        status: 204,
        body: '',
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        accountCreated
          ? [
              {
                id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                label: 'Bybit Live QA',
                key: 'bybit-api-key',
                network: 'testnet',
                exchange: 'bybit',
                exchange_metadata: {
                  product: 'usdt_perp',
                  hedge_mode_only: true,
                  account_mode: 'UTA 1.0 Pro',
                  margin_mode: 'REGULAR_MARGIN',
                  unified_margin_status: 5,
                },
              },
            ]
          : [],
      ),
    })
  })

  await page.route('**/api/order-throttle**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_queued: 0,
        total_in_flight: 0,
        enqueued_total: 0,
        started_total: 0,
        completed_total: 0,
        canceled_total: 0,
        errored_total: 0,
        stale_rejected_total: 0,
        rate_limit_rejected_total: 0,
        delayed_by_limiter_total: 0,
        min_interval_ms: 200,
        max_in_flight_per_account: 3,
        accounts: [],
        bybit_rate_limit: {
          method: 'POST',
          path: '/v5/order/create',
          limit: '10',
          remaining: '9',
          reset_timestamp_ms: '0',
          reset_in_ms: 0,
          exhausted: false,
          observed_at_unix_ms: Date.now(),
        },
      }),
    })
  })

  await page.route('**/api/market-capabilities**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supported: true,
        features: {
          hedge_mode_control: true,
          leverage_control: true,
        },
        warnings: ['USDT linear perpetuals only in Bybit v1.'],
      }),
    })
  })

  await page.route('**/api/account-leverage**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        long_leverage: '1',
        short_leverage: '1',
      }),
    })
  })

  await page.route('**/api/ws-ticket', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ticket: 'fixture-ticket' }),
    })
  })

  await page.route('**/api/account-keys/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          label: 'Bybit Live QA',
          key: 'bybit-api-key',
          network: 'testnet',
          exchange: 'bybit',
          exchange_metadata: {
            product: 'usdt_perp',
            hedge_mode_only: true,
            account_mode: 'UTA 1.0 Pro',
            margin_mode: 'REGULAR_MARGIN',
            unified_margin_status: 5,
          },
        },
      }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: 'New' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Create Account')).toBeVisible()
  await dialog.locator('select').nth(0).selectOption('testnet')
  await dialog.locator('select').nth(1).selectOption('bybit')
  await expect(dialog.getByText('USDT Perpetuals')).toBeVisible()
  await expect(dialog.getByText('Bybit key scope')).toBeVisible()
  await dialog.getByPlaceholder('Exchange key label').fill('  Bybit Live QA  ')
  await dialog.getByPlaceholder('API key').fill('  bybit-api-key  ')
  await dialog.getByPlaceholder('Secret key').fill('  bybit-secret  ')
  await dialog.getByRole('button', { name: 'Check permissions' }).click()
  await expect(dialog.getByText('Key permissions are valid')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect.poll(() => putPayload?.exchange).toBe('bybit')
  expect(putUrl).toContain('/api/accounts/Bybit%20Live%20QA')
  expect(putPayload).toEqual({
    label: 'Bybit Live QA',
    key: 'bybit-api-key',
    secret: 'bybit-secret',
    network: 'testnet',
    exchange: 'bybit',
    exchange_metadata: null,
  })

  await expect(dialog).toBeHidden()
  await expect(accountPanel.getByText('Bybit Live QA')).toBeVisible()
  await expect(accountPanel.getByText('USDT perp')).toBeVisible()
  await expect(accountPanel.getByText('Hedge only')).toBeVisible()
  await expect(accountPanel.getByText('Exchange metadata verified: UTA 1.0 Pro / REGULAR_MARGIN')).toBeVisible()
  await expect(accountPanel.getByText('Queue', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText(/queued\s*\/\s*\d+\s+live/)).toBeVisible()
  await expect(accountPanel.getByText('Bybit Remain')).toBeVisible()
})

test('Missed Bybit trailing entry exposes Continue Anyway action', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const commandPanel = page.getByTestId('command-panel')
  const missedRow = commandPanel.locator('.command-row').filter({
    hasText: 'Bybit missed BTC entry',
  })
  const rejectedRow = commandPanel.locator('.command-row').filter({
    hasText: 'Bybit ADA rejected open',
  })

  await missedRow.getByTitle('Menu').click()
  const continueAction = page.getByRole('menuitem', { name: 'Continue Anyway' })
  await expect(continueAction).toBeVisible()
  await continueAction.click()

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).__tradBybitTerminalFixture?.getContinueMissedEntrySends() ?? [],
      ),
    )
    .toEqual(['12121212-1212-4212-8212-121212121212'])

  await page.keyboard.press('Escape')
  await rejectedRow.getByTitle('Menu').click()
  await expect(page.getByRole('menuitem', { name: 'Continue Anyway' })).toHaveCount(0)
})
