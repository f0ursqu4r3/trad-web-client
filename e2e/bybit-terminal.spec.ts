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

test('Hyperliquid account panel shows and saves builder fee bps clearly', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  let metadataPayload: Record<string, unknown> | null = null
  await page.route('**/api/accounts/**/exchange-metadata', async (route) => {
    const request = route.request()
    if (request.method() !== 'PUT') {
      await route.continue()
      return
    }
    metadataPayload = request.postDataJSON() as Record<string, unknown>
    const exchangeMetadata = metadataPayload.exchange_metadata as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '17171717-1717-4717-8717-171717171717',
        label: 'Hyperliquid QA',
        key: 'redacted',
        network: 'testnet',
        exchange: 'hyperliquid',
        exchange_metadata: exchangeMetadata,
      }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()

  await expect(accountPanel.getByText('Agent Wallet')).toBeVisible()
  await expect(accountPanel.getByRole('button', { name: 'Approve Agent' })).toBeEnabled()
  await expect(accountPanel.getByRole('button', { name: 'Refresh Agent' })).toBeEnabled()
  await expect(accountPanel.getByText('Builder Address')).toBeVisible()
  await expect(accountPanel.getByPlaceholder('0x builder wallet')).toHaveValue(
    '0x3333333333333333333333333333333333333333',
  )
  await expect(accountPanel.getByText('1.0 bps = 0.010%')).toBeVisible()
  await expect(accountPanel.getByText('Approved max:')).toBeVisible()
  await expect(accountPanel.getByText('1.0 bps', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText('approved', { exact: true }).last()).toBeVisible()

  await accountPanel.getByRole('spinbutton', { name: /Fee/ }).fill('2.5')
  await expect(accountPanel.getByText('2.5 bps = 0.025%')).toBeVisible()
  await accountPanel.getByRole('button', { name: 'Save', exact: true }).click()

  await expect.poll(() => metadataPayload).not.toBeNull()
  expect(metadataPayload).toEqual({
    exchange_metadata: {
      product: 'usdc_perp',
      hedge_mode_only: false,
      user_address: '0x1111111111111111111111111111111111111111',
      agent_address: '0x2222222222222222222222222222222222222222',
      agent_approved: true,
      builder_address: '0x3333333333333333333333333333333333333333',
      builder_fee_tenths_bps: 25,
      max_builder_fee_tenths_bps: 10,
      builder_approved: false,
      default_leverage: 1,
    },
  })
  await expect(
    accountPanel.getByText('Saved Hyperliquid builder settings for Hyperliquid QA.'),
  ).toBeVisible()
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

test('Hyperliquid account creation submits wallet agent and exchange metadata', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  let validationPayload: Record<string, unknown> | null = null
  let putUrl = ''
  let putPayload: Record<string, unknown> | null = null
  let accountCreated = false

  await page.route('**/api/accounts**', async (route) => {
    const request = route.request()
    const url = request.url()
    if (request.method() === 'POST' && url.includes('/api/accounts/hyperliquid/agent-key')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          private_key: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          agent_address: '0x2222222222222222222222222222222222222222',
        }),
      })
      return
    }
    if (request.method() === 'POST' && url.includes('/api/accounts/validate')) {
      validationPayload = request.postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          skipped: false,
          exchange: 'hyperliquid',
          network: 'testnet',
          present_permissions: [
            'User wallet address valid',
            'Agent private key valid',
            'Read-only account state reachable',
          ],
          missing_requirements: [],
          warnings: ['Approve the generated agent wallet before live trading.'],
          read_only: false,
          exchange_message: 'fixture Hyperliquid account check ok',
        }),
      })
      return
    }
    if (request.method() === 'PUT') {
      putUrl = url
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
                id: 'abababab-abab-4bab-8bab-abababababab',
                label: 'Hyperliquid Live QA',
                key: '0x1111111111111111111111111111111111111111',
                network: 'testnet',
                exchange: 'hyperliquid',
                exchange_metadata: {
                  product: 'usdc_perp',
                  hedge_mode_only: false,
                  vault_address: '0x4444444444444444444444444444444444444444',
                  builder_address: '0x3333333333333333333333333333333333333333',
                  builder_fee_tenths_bps: 15,
                  builder_approved: false,
                  agent_approved: false,
                  default_leverage: 3,
                  margin_mode: 'isolated',
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

  await page.goto('/e2e/bybit-terminal')

  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: 'New' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Create Account')).toBeVisible()
  await dialog.locator('select').nth(0).selectOption('testnet')
  await dialog.locator('select').nth(1).selectOption('hyperliquid')
  await expect(dialog.getByText('USDC Perpetuals')).toBeVisible()
  await expect(dialog.getByText('Required Hyperliquid setup')).toBeVisible()

  await dialog.getByPlaceholder('Account alias').fill('  Hyperliquid Live QA  ')
  await dialog.getByPlaceholder('0x...').fill('  0x1111111111111111111111111111111111111111  ')
  await dialog.getByRole('button', { name: 'generate' }).click()
  await expect(dialog.getByText('Generated agent 0x2222222222222222222222222222222222222222')).toBeVisible()
  await expect(dialog.getByPlaceholder('32-byte hex private key')).toHaveValue(
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  )
  await dialog
    .getByPlaceholder('Optional 0x vault address')
    .fill('0x4444444444444444444444444444444444444444')
  await dialog.getByLabel('Default Leverage').fill('3')
  await dialog.getByLabel('Margin Mode').selectOption('isolated')
  await dialog.getByPlaceholder('0x builder wallet').fill('0x3333333333333333333333333333333333333333')
  await dialog.getByLabel('Builder Fee').fill('1.5')
  await expect(dialog.getByText('1.5 bps = 0.015%')).toBeVisible()

  await dialog.getByRole('button', { name: 'Check permissions' }).click()
  await expect(dialog.getByText('Wallet, agent key, and read-only Hyperliquid account-state access are valid.')).toBeVisible()
  await expect(dialog.getByText('Approve the generated agent wallet before live trading.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()

  const expectedMetadata = {
    product: 'usdc_perp',
    hedge_mode_only: false,
    vault_address: '0x4444444444444444444444444444444444444444',
    builder_address: '0x3333333333333333333333333333333333333333',
    builder_fee_tenths_bps: 15,
    builder_approved: false,
    agent_approved: false,
    default_leverage: 3,
    margin_mode: 'isolated',
  }

  await expect.poll(() => validationPayload?.exchange).toBe('hyperliquid')
  expect(validationPayload).toEqual({
    key: '0x1111111111111111111111111111111111111111',
    secret: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    network: 'testnet',
    exchange: 'hyperliquid',
    exchange_metadata: expectedMetadata,
  })
  await expect.poll(() => putPayload?.exchange).toBe('hyperliquid')
  expect(putUrl).toContain('/api/accounts/Hyperliquid%20Live%20QA')
  expect(putPayload).toEqual({
    label: 'Hyperliquid Live QA',
    key: '0x1111111111111111111111111111111111111111',
    secret: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    network: 'testnet',
    exchange: 'hyperliquid',
    exchange_metadata: expectedMetadata,
  })
  await expect(dialog).toBeHidden()
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
