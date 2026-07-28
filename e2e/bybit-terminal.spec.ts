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
  await expect(accountPanel.getByText('375/1000 open budget')).toBeVisible()
  await expect(accountPanel.getByText('3 local reject / 1 HTTP 429')).toBeVisible()
  await expect(accountPanel.getByText('120+5/500 actions')).toBeVisible()
  await expect(accountPanel.getByText('15+3 open · fresh 2.0s')).toBeVisible()
})

test('Hyperliquid position view exposes ownership and requires explicit full flatten confirmation', async ({
  page,
}) => {
  await page.goto('/e2e/bybit-terminal')

  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()
  await accountPanel.getByRole('button', { name: 'Positions' }).click()

  const dialog = page.getByRole('dialog', { name: /Hyperliquid Positions/ })
  await expect(dialog.getByText('external surplus')).toBeVisible()
  await expect(dialog.getByText('0.003', { exact: true })).toBeVisible()
  await expect(dialog.getByText('0.002', { exact: true }).first()).toBeVisible()
  await expect(dialog.getByText('0.001', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Limit Order #21212121/ })).toBeVisible()

  await dialog.getByRole('button', { name: 'Refresh Exchange State' }).first().click()
  const evidence = dialog.getByTestId('hyperliquid-reconciliation-evidence')
  await expect(evidence).toBeVisible()
  await expect(evidence.getByText('connected / fresh')).toBeVisible()
  await expect(evidence.getByText('4 (2 Trad / 2 external)')).toBeVisible()
  await expect(evidence.getByText('recorded', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Unknown external open orders: 2')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => (window as any).__tradBybitTerminalFixture?.getCommandSends()))
    .toContainEqual({
      kind: 'RefreshHyperliquidReconciliation',
      data: {
        market_context: {
          hyperliquid: { account_id: '17171717-1717-4717-8717-171717171717' },
        },
        symbol: null,
        command_id: null,
        protection_device_id: null,
      },
    })

  await dialog.getByRole('button', { name: 'Flatten Symbol' }).click()
  await expect(
    dialog.getByText('It also closes external or manually created quantity.'),
  ).toBeVisible()
  const confirm = dialog.getByLabel(/I understand this closes the entire account position/)
  await expect(dialog.getByRole('button', { name: 'Confirm Flatten' })).toBeDisabled()
  await confirm.check()
  await dialog.getByRole('button', { name: 'Confirm Flatten' }).click()

  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__tradBybitTerminalFixture?.getFlattenSymbolSends()),
    )
    .toContain('BTC')
})

test('Hyperliquid opposite-side order preview requires fresh economic confirmation', async ({
  page,
}) => {
  await page.goto('/e2e/bybit-terminal')
  await page.getByTestId('open-hyperliquid-mo').click()

  const dialog = page.getByRole('dialog', { name: 'Market Order' })
  await dialog.getByLabel('Symbol', { exact: true }).fill('REV')
  await expect(dialog.getByText('Reverse', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Current signed position')).toBeVisible()
  const submit = dialog.getByRole('button', { name: 'Submit' })
  await expect(submit).toBeDisabled()
  await dialog.getByLabel(/Confirm reverse from/).check()
  await expect(submit).toBeEnabled()

  await dialog.getByLabel('USD Amount').fill('60')
  await expect(submit).toBeDisabled()
  await dialog.getByLabel(/Confirm reverse from/).check()
  await expect(submit).toBeEnabled()
})

test('partially filled Hyperliquid command offers cancel-remaining-and-close, not cancel', async ({
  page,
}) => {
  await page.goto('/e2e/bybit-terminal')

  const row = page
    .getByTestId('command-panel')
    .locator('.command-row')
    .filter({ hasText: '#21212121' })
  await row.getByTitle('Menu').click()
  await expect(
    page.getByRole('menuitem', { name: 'Cancel Remaining And Close Filled Position' }),
  ).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Cancel Remaining', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Cancel', exact: true })).toHaveCount(0)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('menuitem', { name: 'Cancel Remaining', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__tradBybitTerminalFixture?.getCancelRemainingEntrySends(),
      ),
    )
    .toContain('21212121-2121-4121-8121-212121212121')

  await row.getByTitle('Menu').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('menuitem', { name: 'Cancel Remaining And Close Filled Position' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__tradBybitTerminalFixture?.getClosePositionSends()),
    )
    .toContain('21212121-2121-4121-8121-212121212121')
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

  await expect(accountPanel.getByText('Agent Wallet', { exact: true })).toBeVisible()
  await expect(
    accountPanel.getByText('0x1111111111111111111111111111111111111111', { exact: true }).first(),
  ).toBeVisible()
  await expect(accountPanel.getByText('(main account)', { exact: true })).toBeVisible()
  await expect(accountPanel.getByRole('button', { name: 'Approve Agent' })).toBeEnabled()
  await expect(accountPanel.getByRole('button', { name: 'Refresh Agent' })).toBeEnabled()
  await expect(accountPanel.getByText('Builder Address')).toBeVisible()
  await expect(accountPanel.getByText('0x3333333333333333333333333333333333333333')).toBeVisible()
  await expect(accountPanel.getByPlaceholder('0x builder wallet')).toHaveCount(0)
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
      builder_fee_tenths_bps: 25,
    },
  })
  await expect(
    accountPanel.getByText('Saved Hyperliquid builder settings for Hyperliquid QA.'),
  ).toBeVisible()
})

test('Hyperliquid account panel shows and saves independent execution guards', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  let metadataPayload: Record<string, unknown> | null = null
  await page.route('**/api/accounts/**/exchange-metadata', async (route) => {
    metadataPayload = route.request().postDataJSON() as Record<string, unknown>
    const guards = metadataPayload.exchange_metadata as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '17171717-1717-4717-8717-171717171717',
        label: 'Hyperliquid QA',
        key: 'redacted',
        network: 'testnet',
        exchange: 'hyperliquid',
        exchange_metadata: {
          product: 'usdc_perp',
          hedge_mode_only: false,
          user_address: '0x1111111111111111111111111111111111111111',
          agent_address: '0x2222222222222222222222222222222222222222',
          agent_approved: true,
          builder_address: '0x3333333333333333333333333333333333333333',
          builder_fee_tenths_bps: 10,
          max_builder_fee_tenths_bps: 10,
          builder_approved: true,
          default_leverage: 1,
          ...guards,
        },
      }),
    })
  })

  await page.goto('/e2e/bybit-terminal')
  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()

  await expect(accountPanel.getByRole('spinbutton', { name: /Market Entry Guard/ })).toHaveValue(
    '0.7',
  )
  await expect(accountPanel.getByRole('spinbutton', { name: /Market TP Guard/ })).toHaveValue('1.2')
  await expect(accountPanel.getByRole('spinbutton', { name: /Market SL Guard/ })).toHaveValue('11')

  await accountPanel.getByRole('spinbutton', { name: /Market Entry Guard/ }).fill('0.875')
  await accountPanel.getByRole('spinbutton', { name: /Market TP Guard/ }).fill('1.5')
  await accountPanel.getByRole('spinbutton', { name: /Market SL Guard/ }).fill('12.5')
  await accountPanel.getByRole('button', { name: 'Save Guards' }).click()

  await expect.poll(() => metadataPayload).not.toBeNull()
  expect(metadataPayload).toEqual({
    exchange_metadata: {
      entry_market_guard_tenths_bps: 875,
      take_profit_market_guard_tenths_bps: 1500,
      stop_loss_market_guard_tenths_bps: 12500,
    },
  })
  await expect(
    accountPanel.getByText('Saved Hyperliquid execution guards for Hyperliquid QA.'),
  ).toBeVisible()
})

test('Hyperliquid order forms serialize explicit execution-guard overrides', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')
  await page.getByTestId('open-hyperliquid-mo').click()
  const marketModal = page.getByRole('dialog')
  await expect(
    marketModal.getByText('Account defaults: entry 0.700% / TP 1.200% / SL 11.000%.'),
  ).toBeVisible()
  await marketModal.getByLabel('Override account execution guards').check()
  await marketModal.getByRole('spinbutton', { name: /Market Entry Guard/ }).fill('0.875')
  await marketModal.getByRole('spinbutton', { name: /Market TP Guard/ }).fill('1.5')
  await marketModal.getByRole('spinbutton', { name: /Market SL Guard/ }).fill('12.5')
  await marketModal.getByRole('button', { name: 'Submit' }).click()

  await page.getByTestId('open-hyperliquid-limit').click()
  const limitModal = page.getByRole('dialog')
  await limitModal.getByRole('spinbutton', { name: 'Limit Price' }).fill('65000')
  await limitModal.getByRole('spinbutton', { name: 'Take Profit' }).fill('70000')
  await limitModal.getByRole('spinbutton', { name: 'Stop Loss' }).fill('60000')
  await expect(limitModal.getByText('Account defaults: TP 1.200% / SL 11.000%.')).toBeVisible()
  await limitModal.getByLabel('Override account protection guards').check()
  await limitModal.getByRole('spinbutton', { name: /Market TP Guard/ }).fill('2')
  await limitModal.getByRole('spinbutton', { name: /Market SL Guard/ }).fill('15')
  await limitModal.getByRole('button', { name: 'Submit' }).click()

  const sends = await page.evaluate(() => window.__tradBybitTerminalFixture?.getCommandSends())
  expect(sends).toHaveLength(2)
  expect(sends?.[0]).toMatchObject({
    kind: 'MarketOrder',
    data: {
      execution_guard_overrides: {
        entry_market_tenths_bps: 875,
        take_profit_market_tenths_bps: 1500,
        stop_loss_market_tenths_bps: 12500,
      },
    },
  })
  expect(sends?.[1]).toMatchObject({
    kind: 'LimitOrder',
    data: {
      execution_guard_overrides: {
        entry_market_tenths_bps: null,
        take_profit_market_tenths_bps: 2000,
        stop_loss_market_tenths_bps: 15000,
      },
    },
  })
})

test('Hyperliquid TE is capability-gated, previewed, and submitted with native symbols', async ({
  page,
}) => {
  await page.route('https://api.hyperliquid-testnet.xyz/info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ BTC: '50000' }),
    })
  })
  await page.goto('/e2e/bybit-terminal')
  await page.getByTestId('open-hyperliquid-te').click()

  const dialog = page.getByRole('dialog', { name: 'Trailing Entry' })
  await expect(dialog.getByText('Unavailable', { exact: true })).toBeVisible()
  await expect(
    dialog.getByText(
      'This server does not currently permit Hyperliquid Trailing Entry for the selected account.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeDisabled()

  await page.evaluate(() => window.__tradBybitTerminalFixture?.setHyperliquidTeEnabled(true))
  await expect(dialog.getByText('Unavailable', { exact: true })).toBeHidden()
  await expect(dialog.getByLabel('Take Profit')).toBeVisible()
  await expect(dialog.getByText(/Hyperliquid public mid \$50.00k/)).toBeVisible()
  await dialog.getByRole('button', { name: 'One-way position behavior' }).click()
  const positionInfo = dialog.getByTestId('hyperliquid-te-position-info')
  await expect(
    positionInfo.getByText('Hyperliquid maintains one net position per account and symbol.'),
  ).toBeVisible()
  await expect(
    positionInfo.getByText(
      'Existing same-side exposure remains unowned. This TE protects and closes only fills created by this command.',
    ),
  ).toBeVisible()
  await expect(positionInfo.getByText(/including exposure created outside Trad/)).toBeVisible()
  await expect(
    positionInfo.getByText(
      'Long and short exposure cannot remain open simultaneously on the same symbol.',
    ),
  ).toBeVisible()
  await expect(
    dialog.getByText(
      "Defaults to one child. Trad adds children only when Hyperliquid's order maximum requires them.",
      { exact: true },
    ),
  ).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: /^Target Order Size/ })).toBeHidden()
  await dialog.getByRole('button', { name: 'Advanced splits' }).click()

  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(' btc ')
  await dialog.getByRole('spinbutton', { name: /^Activation Price/ }).fill('50000')
  await dialog.getByRole('spinbutton', { name: /^Jump Threshold/ }).fill('0.1')
  await dialog.getByRole('spinbutton', { name: /^Stop Loss/ }).fill('49000')
  await dialog.getByRole('spinbutton', { name: /^Take Profit/ }).fill('51000')
  await dialog.getByRole('spinbutton', { name: /^Risk Amount/ }).fill('10')
  await dialog.getByRole('spinbutton', { name: /^Target Order Size/ }).fill('50')
  await dialog.getByRole('spinbutton', { name: /^Max Splits Cap/ }).fill('2')
  await dialog.getByRole('combobox', { name: 'Split Mode' }).selectOption('prefer_target')
  await dialog.getByRole('spinbutton', { name: /^Slippage Margin/ }).fill('0.2')

  await expect(dialog.getByText('Estimated splits (current price)')).toBeVisible()
  await expect(dialog.getByText('2 (range 2–2)', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Submit' }).click()

  const sends = await page.evaluate(() => window.__tradBybitTerminalFixture?.getCommandSends())
  const trailingEntries = (sends ?? []).filter(
    (payload: any) => payload?.kind === 'TrailingEntryOrder',
  )
  expect(trailingEntries.at(-1)).toMatchObject({
    kind: 'TrailingEntryOrder',
    data: {
      symbol: 'BTC',
      position_side: 'Long',
      activation_price: 50000,
      jump_frac_threshold: 0.1,
      stop_loss: 49000,
      take_profit: 51000,
      risk_amount: 10,
      split_settings: {
        target_child_notional: 50,
        max_splits_cap: 2,
        mode: 'prefer_target',
        slippage_margin: 0.002,
      },
    },
  })
  await expect
    .poll(() => page.evaluate(() => window.__tradBybitTerminalFixture?.getSelectedCommandId()))
    .toBe('19191919-1919-4919-8919-191919191919')
  await expect
    .poll(() => page.evaluate(() => window.__tradBybitTerminalFixture?.getInspectCommandSends()))
    .toContain('19191919-1919-4919-8919-191919191919')
})

test('Hyperliquid short TE serializes side-correct exits and native symbols', async ({ page }) => {
  await page.route('https://api.hyperliquid-testnet.xyz/info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ETH: '3000' }),
    })
  })
  await page.goto('/e2e/bybit-terminal')
  await page.getByTestId('open-hyperliquid-te').click()

  const dialog = page.getByRole('dialog', { name: 'Trailing Entry' })
  await expect(dialog.getByText('Unavailable', { exact: true })).toBeVisible()
  await page.evaluate(() => window.__tradBybitTerminalFixture?.setHyperliquidTeEnabled(true))
  await expect(dialog.getByText('Unavailable', { exact: true })).toBeHidden()
  await dialog.getByRole('textbox', { name: 'Symbol' }).fill(' eth ')
  await dialog.getByRole('combobox', { name: 'Position Side' }).selectOption('Short')
  await dialog.getByRole('spinbutton', { name: /^Activation Price/ }).fill('3000')
  await dialog.getByRole('spinbutton', { name: /^Jump Threshold/ }).fill('0.2')
  await dialog.getByRole('spinbutton', { name: /^Stop Loss/ }).fill('3100')
  await dialog.getByRole('spinbutton', { name: /^Take Profit/ }).fill('2800')
  await dialog.getByRole('spinbutton', { name: /^Risk Amount/ }).fill('12')

  await expect(dialog.getByText('Estimated splits (current price)')).toBeVisible()
  await expect(dialog.getByText('1 (range 1–1)', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: /^Target Order Size/ })).toBeHidden()
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Submit' }).click()

  const sends = await page.evaluate(() => window.__tradBybitTerminalFixture?.getCommandSends())
  const trailingEntries = (sends ?? []).filter(
    (payload: any) => payload?.kind === 'TrailingEntryOrder',
  )
  expect(trailingEntries.at(-1)).toMatchObject({
    kind: 'TrailingEntryOrder',
    data: {
      symbol: 'ETH',
      position_side: 'Short',
      activation_price: 3000,
      jump_frac_threshold: 0.2,
      stop_loss: 3100,
      take_profit: 2800,
      risk_amount: 12,
    },
  })
})

test('Hyperliquid TE tree exposes owned exposure, reversal, mixed children, and reconciliation', async ({
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
  const commandRow = commandPanel.locator('.command-row').filter({
    hasText: 'Hyperliquid ETH ownership conflict',
  })
  await commandRow.click()

  const devicePanel = page.getByTestId('device-tree-panel')
  const details = page.getByTestId('device-details-panel')
  const deviceRows = devicePanel.locator('.device-row')

  await expect(deviceRows.filter({ hasText: 'Trailing Entry' })).toHaveCount(1)
  await expect(deviceRows.filter({ hasText: 'Split' })).toHaveCount(1)
  await expect(deviceRows.filter({ hasText: 'Market Order' })).toHaveCount(2)
  await expect(deviceRows.filter({ hasText: 'Native Protection' })).toHaveCount(1)
  await expect(deviceRows.filter({ hasText: 'Failed' })).toHaveCount(1)

  await deviceRows.filter({ hasText: 'Trailing Entry' }).click()
  await expect(details.getByText('ReconciliationRequired', { exact: true })).toBeVisible()
  await expect(details.getByText('Command-Owned Remaining', { exact: true })).toBeVisible()
  await expect(details.getByText('0.650000', { exact: true })).toBeVisible()
  const economics = details.getByTestId('te-economics-summary')
  await expect(economics.getByText('Reported Closed PnL', { exact: true })).toBeVisible()
  await expect(economics.getByText('0.8 USDC', { exact: true })).toBeVisible()
  await expect(economics.getByText('Total Execution Fees', { exact: true })).toBeVisible()
  await expect(economics.getByText('0.15 USDC', { exact: true })).toBeVisible()
  await expect(economics.getByText('Net After Fees', { exact: true })).toBeVisible()
  await expect(economics.getByText('0.65 USDC', { exact: true })).toBeVisible()
  await expect(economics.getByText('Builder Component', { exact: true })).toBeVisible()
  await expect(economics.getByText('0.01 USDC', { exact: true })).toBeVisible()
  await expect(economics.getByText('Exchange Component', { exact: true })).toBeVisible()
  await expect(economics.getByText('0.14 USDC', { exact: true })).toBeVisible()
  await expect(economics.getByText('2', { exact: true })).toBeVisible()
  await expect(
    economics.getByText(
      'Realized exchange-reported PnL minus execution fees. Funding and unrealized PnL are not included.',
      { exact: true },
    ),
  ).toBeVisible()
  await expect(
    economics.getByText(
      'This command reversed an existing one-way position. These totals include the pre-entry flatten; inspect the child fills to separate its economics from the new TE exposure.',
      { exact: true },
    ),
  ).toBeVisible()
  await page.evaluate(() => window.__tradBybitTerminalFixture?.setHyperliquidTeTriggerStartZero())
  await expect(
    details
      .getByText('Start Trigger', { exact: true })
      .locator('..')
      .getByText('0', { exact: true }),
  ).toBeVisible()

  await deviceRows.filter({ hasText: 'Market Order' }).filter({ hasText: 'Completed' }).click()
  await expect(details.getByText('TE exposure target', { exact: true })).toBeVisible()
  await expect(details.getByText('One-Way Net Effect', { exact: true })).toBeVisible()
  await expect(details.getByText('Reversal', { exact: true })).toBeVisible()
  await expect(details.getByText('Target side exposure', { exact: true })).toBeVisible()
  await expect(details.getByText('Short 0.2500', { exact: true })).toBeVisible()
  await expect(details.getByText('0.7500', { exact: true }).first()).toBeVisible()

  await deviceRows.filter({ hasText: 'Market Order' }).filter({ hasText: 'Failed' }).click()
  await expect(details.getByText('Rejected', { exact: true }).first()).toBeVisible()
  await expect(
    details.getByText('Hyperliquid rejected split child: insufficient margin'),
  ).toBeVisible()

  await deviceRows.filter({ hasText: 'Native Protection' }).click()
  await expect(details.getByText('Reconciliation required', { exact: true })).toBeVisible()
  await expect(details.getByText('Aggregate Trad Owned', { exact: true })).toBeVisible()
  await expect(details.getByText('Protection Groups', { exact: true })).toBeVisible()
  await expect(
    details.getByText(
      'Live position 0.60000000 is below 0.75000000 aggregate Trad-owned protected quantity',
      { exact: true },
    ),
  ).toBeVisible()

  await page.evaluate(() => window.__tradBybitTerminalFixture?.replayHyperliquidTeSnapshots())
  await expect(deviceRows).toHaveCount(5)

  await commandRow.getByTitle('Menu').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('menuitem', { name: 'Close Position' }).click()
  await expect
    .poll(() => page.evaluate(() => window.__tradBybitTerminalFixture?.getClosePositionSends()))
    .toEqual(['61616161-6161-4161-8161-616161616161'])

  await commandRow.getByTitle('Menu').click()
  await expect(page.getByRole('menuitem', { name: 'Cancel', exact: true })).toHaveCount(0)
})

test('Hyperliquid missed TE exposes durable Continue Anyway recovery', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/bybit-terminal')
  const commandRow = page
    .getByTestId('command-panel')
    .locator('.command-row')
    .filter({ hasText: 'Hyperliquid missed SOL entry' })

  await commandRow.click()
  await expect(
    page
      .getByTestId('device-tree-panel')
      .locator('.device-row')
      .filter({ hasText: 'Missed Entry Paused' }),
  ).toBeVisible()

  await commandRow.getByTitle('Menu').click()
  await page.getByRole('menuitem', { name: 'Continue Anyway' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__tradBybitTerminalFixture?.getContinueMissedEntrySends()),
    )
    .toContain('67676767-6767-4767-8767-676767676767')
})

test('Hyperliquid Chase form serializes post-only strategy controls and protection', async ({
  page,
}) => {
  await page.goto('/e2e/bybit-terminal')
  await page.getByTestId('open-hyperliquid-chase').click()

  const dialog = page.getByRole('dialog', { name: 'Chase Order' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Maximum Distance (bps)')).toHaveValue('20')
  await expect(dialog.getByText('0.2% from the first working best bid')).toBeVisible()
  await expect(dialog.getByLabel('Expiry (minutes)')).toHaveValue('5')
  await dialog.getByLabel('USDC Amount').fill('80')
  await dialog.getByLabel('Maximum Distance (bps)').fill('15')
  await dialog.getByLabel('Take Profit').fill('51000')
  await dialog.getByLabel('Stop Loss').fill('49000')
  await dialog.getByLabel('Override account protection guards').check()
  await dialog.getByRole('spinbutton', { name: /Market TP Guard/ }).fill('2')
  await dialog.getByRole('spinbutton', { name: /Market SL Guard/ }).fill('15')
  await dialog.getByRole('button', { name: 'Start Chase' }).click()

  let sends = await page.evaluate(() => window.__tradBybitTerminalFixture?.getCommandSends())
  expect(sends?.at(-1)).toEqual({
    kind: 'ChaseOrder',
    data: {
      action: 'open',
      side: 'Buy',
      symbol: 'BTC',
      quantity: 80,
      quantity_mode: 'notional',
      position_side: 'Long',
      market_context: {
        hyperliquid: { account_id: '17171717-1717-4717-8717-171717171717' },
      },
      boundary: { kind: 'basis_points', value: 15 },
      expires_after_secs: 300,
      attached_exit_plan: { take_profit: 51000, stop_loss: 49000 },
      execution_guard_overrides: {
        entry_market_tenths_bps: null,
        take_profit_market_tenths_bps: 2000,
        stop_loss_market_tenths_bps: 15000,
      },
    },
  })

  await page.getByTestId('open-hyperliquid-chase').click()
  const untilCanceledDialog = page.getByRole('dialog', { name: 'Chase Order' })
  await untilCanceledDialog.getByLabel('Adverse Boundary').selectOption('price')
  await untilCanceledDialog.getByLabel('Maximum Adverse Price').fill('50500')
  await untilCanceledDialog.getByLabel('Run until canceled').check()
  await expect(
    untilCanceledDialog.getByText(/remains active across sessions and restarts/),
  ).toBeVisible()
  await untilCanceledDialog.getByRole('button', { name: 'Start Chase' }).click()

  sends = await page.evaluate(() => window.__tradBybitTerminalFixture?.getCommandSends())
  expect(sends?.at(-1)).toMatchObject({
    kind: 'ChaseOrder',
    data: {
      boundary: { kind: 'price', value: 50500 },
      expires_after_secs: null,
    },
  })
})

test('Hyperliquid Chase renders composed attempts, diagnostics, stale state, and cancel', async ({
  page,
}) => {
  await page.goto('/e2e/bybit-terminal')

  const deviceTree = page.getByTestId('device-tree-panel')
  await deviceTree.getByText('Chase', { exact: true }).click()
  await expect(deviceTree.getByText('Limit Order', { exact: true })).toHaveCount(3)
  const chaseProtectionRow = deviceTree
    .locator('.device-row')
    .filter({ hasText: 'Native Protection' })
    .filter({ hasText: 'BTC' })
    .filter({ hasText: 'Hyperliquid' })
  await expect(chaseProtectionRow).toBeVisible()

  const details = page.getByTestId('device-details-panel')
  await expect(details.getByText('Chase Device')).toBeVisible()
  await expect(details.getByText('Best Bid', { exact: true })).toBeVisible()
  await expect(details.getByText('$50.02k', { exact: true }).first()).toBeVisible()
  await expect(details.getByText('0.000500', { exact: true }).first()).toBeVisible()
  await expect(details.getByText('0.001000', { exact: true }).first()).toBeVisible()
  await expect(details.getByText('33.33%', { exact: true })).toBeVisible()
  await expect(details.getByText('20 bps (0.2%)', { exact: true })).toBeVisible()
  await expect(details.getByText('TP $51.00k / SL $49.00k', { exact: true })).toBeVisible()
  await expect(details.getByText('Child protection devices', { exact: true })).toBeVisible()

  const attempts = details.getByTestId('chase-attempt-history').locator('tbody tr')
  await expect(attempts).toHaveCount(1)
  await details.getByRole('button', { name: /Replacement History/ }).click()
  await expect(attempts).toHaveCount(2)

  await page.evaluate(() => window.__tradBybitTerminalFixture?.setChaseStale())
  await expect(details.getByTestId('chase-stale-warning')).toBeVisible()
  await expect(details.getByText('Paused Stale Market', { exact: true })).toBeVisible()

  await details.getByRole('button', { name: 'Cancel Chase' }).click()
  await expect
    .poll(async () => {
      return await page.evaluate(() => window.__tradBybitTerminalFixture?.getCommandSends())
    })
    .toContainEqual({
      kind: 'CancelDevice',
      data: { device_id: '26262626-2626-4626-8626-262626262626' },
    })

  await chaseProtectionRow.click()
  await expect(details.getByText('Exposure Ownership')).toBeVisible()
  await expect(details.getByText('External surplus', { exact: true })).toBeVisible()
  await expect(details.getByText('Command Owned', { exact: true })).toBeVisible()
  await expect(details.getByText('Aggregate Trad Owned', { exact: true })).toBeVisible()
  await expect(
    details.getByText(
      'Live position 0.00100000 includes 0.00050000 same-side quantity not owned by Trad protection groups',
      { exact: true },
    ),
  ).toBeVisible()
  await details.getByRole('button', { name: 'Refresh Exchange State' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).__tradBybitTerminalFixture?.getCommandSends()))
    .toContainEqual({
      kind: 'RefreshHyperliquidReconciliation',
      data: {
        market_context: {
          type: 'hyperliquid',
          account_id: '17171717-1717-4717-8717-171717171717',
        },
        symbol: 'BTC',
        command_id: '25252525-2525-4525-8525-252525252525',
        protection_device_id: '29292929-2929-4929-8929-292929292929',
      },
    })
})

test('Hyperliquid Chase command summary duplicates all strategy parameters', async ({ page }) => {
  await page.goto('/e2e/bybit-terminal')

  const row = page
    .getByTestId('command-panel')
    .locator('.command-row')
    .filter({ hasText: '#25252525' })
  await expect(row.getByText('Chase Order', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Toggle details' }).click()
  await expect(row.getByText('75 USDC', { exact: true })).toBeVisible()
  await expect(row.getByText('20 bps (0.2%)', { exact: true })).toBeVisible()
  await expect(row.getByText('5m', { exact: true })).toBeVisible()

  await row.getByTitle('Menu').click()
  await page.getByRole('menuitem', { name: 'Refresh Exchange State' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).__tradBybitTerminalFixture?.getCommandSends()))
    .toContainEqual({
      kind: 'RefreshHyperliquidReconciliation',
      data: {
        market_context: {
          hyperliquid: { account_id: '17171717-1717-4717-8717-171717171717' },
        },
        symbol: 'BTC',
        command_id: '25252525-2525-4525-8525-252525252525',
        protection_device_id: null,
      },
    })
  await row.getByTitle('Menu').click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  const dialog = page.getByRole('dialog', { name: 'Chase Order' })
  await expect(dialog.getByLabel('USDC Amount')).toHaveValue('75')
  await expect(dialog.getByLabel('Maximum Distance (bps)')).toHaveValue('20')
  await expect(dialog.getByLabel('Expiry (minutes)')).toHaveValue('5')
  await expect(dialog.getByLabel('Take Profit')).toHaveValue('51000')
  await expect(dialog.getByLabel('Stop Loss')).toHaveValue('49000')
})

test('working Hyperliquid limit order can be canceled from device details', async ({ page }) => {
  await page.goto('/e2e/bybit-terminal')

  const deviceTree = page.getByTestId('device-tree-panel')
  await deviceTree.getByText('Limit Order', { exact: true }).first().click()

  const details = page.getByTestId('device-details-panel')
  await expect(details.getByText('Limit Order Device')).toBeVisible()
  await expect(details.getByText('Filled Quantity')).toBeVisible()
  await expect(details.getByText('0.000200', { exact: true })).toBeVisible()
  await expect(details.getByText('Remaining Quantity')).toBeVisible()
  await expect(details.getByText('0.000300', { exact: true })).toBeVisible()
  await expect(details.getByText('Fill Progress')).toBeVisible()
  await expect(details.getByText('40%', { exact: true })).toBeVisible()
  await expect(details.getByText('Account ID')).toBeVisible()
  await expect(details.getByText('17171717...', { exact: true })).toBeVisible()
  const executionSummary = details.getByTestId('execution-fill-summary')
  await expect(executionSummary.getByText('Average Fill')).toBeVisible()
  await expect(executionSummary.getByText('$50.01k', { exact: true })).toBeVisible()
  await expect(executionSummary.getByText('Total Fee')).toBeVisible()
  await expect(executionSummary.getByText('0.01 USDC', { exact: true })).toBeVisible()
  await expect(executionSummary.getByText('Builder Component')).toBeVisible()
  await expect(executionSummary.getByText('0.002 USDC', { exact: true })).toBeVisible()
  await expect(executionSummary.getByText('Exchange Component')).toBeVisible()
  await expect(executionSummary.getByText('0.008 USDC', { exact: true })).toBeVisible()
  await expect(executionSummary.getByText('Reported Closed PnL')).toBeVisible()
  await expect(executionSummary.getByText('0.35 USDC', { exact: true })).toBeVisible()
  await details.getByText('Fills (2)').click()
  await expect(details.getByText('Taker', { exact: true })).toBeVisible()
  await expect(details.getByText('Maker', { exact: true })).toBeVisible()
  await expect(details.getByText('Start Position').first()).toBeVisible()
  await expect(details.getByText('fill-1', { exact: true })).toBeVisible()
  await expect(details.getByText('0xabc', { exact: true })).toBeVisible()
  await details.getByRole('button', { name: 'Cancel limit order' }).click()

  await expect
    .poll(async () => {
      return await page.evaluate(() =>
        (window as any).__tradBybitTerminalFixture?.getCommandSends(),
      )
    })
    .toContainEqual({
      kind: 'CancelDevice',
      data: { device_id: '23232323-2323-4323-8323-232323232323' },
    })
  await expect(details.getByRole('button', { name: 'Cancel requested' })).toBeDisabled()
})

test('Hyperliquid limit command exposes its intent and duplicates into the limit form', async ({
  page,
}) => {
  await page.goto('/e2e/bybit-terminal')

  const row = page
    .getByTestId('command-panel')
    .locator('.command-row')
    .filter({ hasText: '#21212121' })
  await expect(row.getByText('Limit Order', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Toggle details' }).click()
  await expect(row.getByText('Requested Amount', { exact: true })).toBeVisible()
  await expect(row.getByText('25 USDC', { exact: true })).toBeVisible()
  await expect(row.getByText('$50,000', { exact: true })).toBeVisible()
  await expect(row.getByText('Good Till Canceled', { exact: true })).toBeVisible()

  await row.getByTitle('Menu').click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  const dialog = page.getByRole('dialog', { name: 'Limit Order' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('select').first()).toHaveValue('17171717-1717-4717-8717-171717171717')
  await expect(dialog.getByLabel('Symbol', { exact: true })).toHaveValue('BTC')
  await expect(dialog.getByLabel('USDC Amount', { exact: true })).toHaveValue('25')
  await expect(dialog.getByLabel('Limit Price', { exact: true })).toHaveValue('50000')
  await expect(
    dialog.locator('label').filter({ hasText: 'Time in Force' }).locator('select'),
  ).toHaveValue('gtc')
})

test('Hyperliquid account panel submits wallet-signed agent and builder approvals', async ({
  page,
}) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.addInitScript(() => {
    const walletRequests: Array<{ method: string; params?: unknown[] }> = []
    let walletChainId = '0x1'
    let hasArbitrumSepolia = false
    Object.defineProperty(window, '__tradHyperliquidWalletRequests', {
      value: walletRequests,
      configurable: true,
    })
    Date.now = () => 1780000000123
    window.ethereum = {
      request: async (args: { method: string; params?: unknown[] }) => {
        walletRequests.push(args)
        if (args.method === 'eth_requestAccounts') {
          return ['0x1111111111111111111111111111111111111111']
        }
        if (args.method === 'eth_chainId') {
          return walletChainId
        }
        if (args.method === 'wallet_switchEthereumChain') {
          if (!hasArbitrumSepolia) {
            throw Object.assign(new Error('Unrecognized chain.'), { code: 4902 })
          }
          walletChainId = (args.params?.[0] as { chainId: string }).chainId
          return null
        }
        if (args.method === 'wallet_addEthereumChain') {
          hasArbitrumSepolia = true
          walletChainId = (args.params?.[0] as { chainId: string }).chainId
          return null
        }
        if (args.method === 'eth_signTypedData_v4') {
          return `0x${'1'.repeat(64)}${'2'.repeat(64)}1b`
        }
        throw new Error(`unexpected wallet request ${args.method}`)
      },
    }
  })

  let agentApprovalPayload: Record<string, unknown> | null = null
  let builderApprovalPayload: Record<string, unknown> | null = null
  await page.route('**/api/accounts/**/hyperliquid/agent-approval', async (route) => {
    agentApprovalPayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          id: '17171717-1717-4717-8717-171717171717',
          label: 'Hyperliquid QA',
          key: 'redacted',
          network: 'testnet',
          exchange: 'hyperliquid',
          exchange_metadata: {
            product: 'usdc_perp',
            hedge_mode_only: false,
            user_address: '0x1111111111111111111111111111111111111111',
            agent_address: '0x2222222222222222222222222222222222222222',
            agent_approved: true,
            builder_address: '0x3333333333333333333333333333333333333333',
            builder_fee_tenths_bps: 10,
            max_builder_fee_tenths_bps: 100,
            builder_approved: true,
            default_leverage: 1,
          },
        },
        agent_approved: true,
        exchange_response: { status: 'ok' },
      }),
    })
  })
  await page.route('**/api/accounts/**/hyperliquid/builder-approval', async (route) => {
    builderApprovalPayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          id: '17171717-1717-4717-8717-171717171717',
          label: 'Hyperliquid QA',
          key: 'redacted',
          network: 'testnet',
          exchange: 'hyperliquid',
          exchange_metadata: {
            product: 'usdc_perp',
            hedge_mode_only: false,
            user_address: '0x1111111111111111111111111111111111111111',
            agent_address: '0x2222222222222222222222222222222222222222',
            agent_approved: true,
            builder_address: '0x3333333333333333333333333333333333333333',
            builder_fee_tenths_bps: 10,
            max_builder_fee_tenths_bps: 100,
            builder_approved: true,
            default_leverage: 1,
          },
        },
        max_builder_fee_tenths_bps: 100,
        exchange_response: { status: 'ok' },
      }),
    })
  })

  await page.goto('/e2e/bybit-terminal')

  let accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()
  await accountPanel.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(
    accountPanel.getByText('Hyperliquid builder fee approved up to 10.0 bps for Hyperliquid QA.'),
  ).toBeVisible()

  const builderTypedDataRequests = await page.evaluate(() =>
    (window as any).__tradHyperliquidWalletRequests.filter(
      (request: { method: string }) => request.method === 'eth_signTypedData_v4',
    ),
  )

  await page.goto('/e2e/bybit-terminal')

  accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()
  await accountPanel.getByRole('button', { name: 'Approve Agent' }).click()
  await expect(
    accountPanel.getByText('Hyperliquid agent wallet approved for Hyperliquid QA.'),
  ).toBeVisible()

  await expect.poll(() => agentApprovalPayload).not.toBeNull()
  await expect.poll(() => builderApprovalPayload).not.toBeNull()

  expect(agentApprovalPayload).toMatchObject({
    action: {
      type: 'approveAgent',
      hyperliquidChain: 'Testnet',
      signatureChainId: '0x66eee',
      agentAddress: '0x2222222222222222222222222222222222222222',
      agentName: 'trad',
      nonce: 1780000000123,
    },
    nonce: 1780000000123,
    signature: {
      r: `0x${'1'.repeat(64)}`,
      s: `0x${'2'.repeat(64)}`,
      v: 27,
    },
    agent_address: '0x2222222222222222222222222222222222222222',
    agent_name: 'trad',
  })
  expect(builderApprovalPayload).toMatchObject({
    action: {
      type: 'approveBuilderFee',
      hyperliquidChain: 'Testnet',
      signatureChainId: '0x66eee',
      maxFeeRate: '0.100%',
      builder: '0x3333333333333333333333333333333333333333',
      nonce: 1780000000123,
    },
    nonce: 1780000000123,
    signature: {
      r: `0x${'1'.repeat(64)}`,
      s: `0x${'2'.repeat(64)}`,
      v: 27,
    },
    builder_address: '0x3333333333333333333333333333333333333333',
    builder_fee_tenths_bps: 10,
  })

  const agentTypedDataRequests = await page.evaluate(() =>
    (window as any).__tradHyperliquidWalletRequests.filter(
      (request: { method: string }) => request.method === 'eth_signTypedData_v4',
    ),
  )
  expect(builderTypedDataRequests).toHaveLength(1)
  expect(agentTypedDataRequests).toHaveLength(1)
  const walletNetworkRequests = await page.evaluate(() =>
    (window as any).__tradHyperliquidWalletRequests.filter(
      (request: { method: string }) =>
        request.method === 'wallet_switchEthereumChain' ||
        request.method === 'wallet_addEthereumChain',
    ),
  )
  expect(walletNetworkRequests).toEqual([
    {
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x66eee' }],
    },
    {
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0x66eee',
          chainName: 'Arbitrum Sepolia',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
          blockExplorerUrls: ['https://sepolia.arbiscan.io'],
        },
      ],
    },
    {
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x66eee' }],
    },
  ])
  const builderTypedData = JSON.parse(builderTypedDataRequests[0].params[1])
  const agentTypedData = JSON.parse(agentTypedDataRequests[0].params[1])
  expect(agentTypedData).toMatchObject({
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 421614,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    message: {
      hyperliquidChain: 'Testnet',
      agentAddress: '0x2222222222222222222222222222222222222222',
      agentName: 'trad',
      nonce: 1780000000123,
    },
  })
  expect(builderTypedData).toMatchObject({
    domain: {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: 421614,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
    message: {
      hyperliquidChain: 'Testnet',
      maxFeeRate: '0.100%',
      builder: '0x3333333333333333333333333333333333333333',
      nonce: 1780000000123,
    },
  })
})

test('Hyperliquid wallet approval errors are recoverable without reloading', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.addInitScript(() => {
    Object.defineProperty(window, '__tradWalletMode', {
      value: 'wrong',
      writable: true,
      configurable: true,
    })
    window.ethereum = {
      request: async (args: { method: string; params?: unknown[] }) => {
        const mode = (window as any).__tradWalletMode
        if (args.method === 'eth_requestAccounts') {
          if (mode === 'disconnected') return []
          return [
            mode === 'wrong'
              ? '0x9999999999999999999999999999999999999999'
              : '0x1111111111111111111111111111111111111111',
          ]
        }
        if (args.method === 'eth_chainId') {
          return '0x66eee'
        }
        if (args.method === 'eth_signTypedData_v4') {
          if (mode === 'reject') throw new Error('User rejected the request.')
          return `0x${'1'.repeat(64)}${'2'.repeat(64)}1b`
        }
        throw new Error(`unexpected wallet request ${args.method}`)
      },
    }
  })

  let rejectForMissingDeposit = false
  await page.route('**/api/accounts/**/hyperliquid/agent-approval', async (route) => {
    if (rejectForMissingDeposit) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Hyperliquid rejected agent approval',
          exchange_response: {
            status: 'err',
            response: 'Must deposit before performing actions.',
          },
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          id: '17171717-1717-4717-8717-171717171717',
          label: 'Hyperliquid QA',
          key: 'redacted',
          network: 'testnet',
          exchange: 'hyperliquid',
          exchange_metadata: {
            product: 'usdc_perp',
            user_address: '0x1111111111111111111111111111111111111111',
            agent_address: '0x2222222222222222222222222222222222222222',
            agent_approved: true,
            agent_approval_verified_at_ms: 1780000000000,
            builder_address: '0x3333333333333333333333333333333333333333',
            builder_fee_tenths_bps: 10,
          },
        },
        agent_approved: true,
      }),
    })
  })

  await page.goto('/e2e/bybit-terminal')
  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()
  const approveAgent = accountPanel.getByRole('button', { name: 'Approve Agent' })

  await page.evaluate(() => ((window as any).__tradWalletMode = 'disconnected'))
  await approveAgent.click()
  await expect(accountPanel.getByText(/Current wallet: none/)).toBeVisible()
  await expect(approveAgent).toBeEnabled()

  await page.evaluate(() => ((window as any).__tradWalletMode = 'wrong'))
  await approveAgent.click()
  await expect(accountPanel.getByText(/Connected wallet must match/)).toBeVisible()
  await expect(approveAgent).toBeEnabled()

  await page.evaluate(() => ((window as any).__tradWalletMode = 'reject'))
  await approveAgent.click()
  await expect(accountPanel.getByText('User rejected the request.')).toBeVisible()
  await expect(approveAgent).toBeEnabled()

  await page.evaluate(() => ((window as any).__tradWalletMode = 'success'))
  rejectForMissingDeposit = true
  await approveAgent.click()
  await expect(
    accountPanel.getByText(
      'Hyperliquid requires this wallet to receive account funds before it will accept approval actions. Fund the wallet on this network, then try again.',
    ),
  ).toBeVisible()
  await expect(approveAgent).toBeEnabled()

  rejectForMissingDeposit = false
  await approveAgent.click()
  await expect(
    accountPanel.getByText('Hyperliquid agent wallet approved for Hyperliquid QA.'),
  ).toBeVisible()
})

test('Hyperliquid agent refresh surfaces exchange-side revocation', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
  await page.route('**/api/accounts/**/hyperliquid/agent-approval/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          id: '17171717-1717-4717-8717-171717171717',
          label: 'Hyperliquid QA',
          key: 'redacted',
          network: 'testnet',
          exchange: 'hyperliquid',
          exchange_metadata: {
            product: 'usdc_perp',
            user_address: '0x1111111111111111111111111111111111111111',
            agent_address: '0x2222222222222222222222222222222222222222',
            agent_approved: false,
            agent_approval_verified_at_ms: null,
            builder_address: '0x3333333333333333333333333333333333333333',
            builder_fee_tenths_bps: 10,
          },
        },
        agent_approved: false,
      }),
    })
  })

  await page.goto('/e2e/bybit-terminal')
  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: /Hyperliquid QA/ }).click()
  await accountPanel.getByRole('button', { name: 'Refresh Agent' }).click()

  await expect(
    accountPanel.getByText('Hyperliquid agent wallet is not approved for Hyperliquid QA.'),
  ).toBeVisible()
  await expect(accountPanel.getByText('unvalidated', { exact: true }).first()).toBeVisible()
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
  await expect(deviceRows.filter({ hasText: 'Trailing Entry' })).toHaveCount(103)

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

test('Hyperliquid terminal remains inspectable with fifty active TE rows', async ({ page }) => {
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
  const deviceRows = devicePanel.locator('.device-row')

  await devicePanel.getByRole('button', { name: 'Hyperliquid', exact: true }).click()
  await expect(deviceRows.filter({ hasText: 'Trailing Entry' })).toHaveCount(52)

  await devicePanel.getByRole('button', { name: 'ZRO', exact: true }).click()
  await expect(deviceRows.filter({ hasText: 'Trailing Entry' })).toHaveCount(1)

  const zroRow = deviceRows.filter({ hasText: 'ZRO' })
  await zroRow.scrollIntoViewIfNeeded()
  await zroRow.click()

  await expect(detailsPanel.getByText('Trailing Entry Device')).toBeVisible()
  await expect(detailsPanel.getByText('ZRO').first()).toBeVisible()
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
  await expect(detailsPanel.getByText('observed 1 linked TP/SL orders, expected 2')).toBeVisible()
})

test('Bybit account creation submits exchange credentials through account API', async ({
  page,
}) => {
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
  await expect(
    accountPanel.getByText('Exchange metadata verified: UTA 1.0 Pro / REGULAR_MARGIN'),
  ).toBeVisible()
  await expect(accountPanel.getByText('Queue', { exact: true })).toBeVisible()
  await expect(accountPanel.getByText(/queued\s*\/\s*\d+\s+live/)).toBeVisible()
  await expect(accountPanel.getByText('Bybit Remain')).toBeVisible()
})

test('Hyperliquid account creation submits wallet agent and exchange metadata', async ({
  page,
}) => {
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
            'Agent private key will be generated and encrypted by Trad when saved',
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
                  agent_address: '0x2222222222222222222222222222222222222222',
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
  await expect(dialog.getByRole('button', { name: 'Generate securely' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(dialog.getByText('It is never sent to this browser.')).toBeVisible()
  await expect(dialog.getByPlaceholder('32-byte hex private key')).toHaveCount(0)
  await dialog
    .getByPlaceholder('Optional 0x vault address')
    .fill('0x4444444444444444444444444444444444444444')
  await dialog.getByLabel('Default Leverage').fill('3')
  await dialog.getByLabel('Margin Mode').selectOption('isolated')
  await expect(dialog.getByText('Trad configured')).toBeVisible()
  await dialog.getByLabel('Builder Fee').fill('1.5')
  await expect(dialog.getByText('1.5 bps = 0.015%')).toBeVisible()

  await dialog.getByRole('button', { name: 'Check permissions' }).click()
  await expect(
    dialog.getByText(
      'Wallet and read-only account access are valid. The agent key will be generated securely when saved.',
    ),
  ).toBeVisible()
  await expect(
    dialog.getByText('Approve the generated agent wallet before live trading.'),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()

  const expectedMetadata = {
    product: 'usdc_perp',
    hedge_mode_only: false,
    vault_address: '0x4444444444444444444444444444444444444444',
    builder_fee_tenths_bps: 15,
    builder_approved: false,
    agent_approved: false,
    default_leverage: 3,
    margin_mode: 'isolated',
    entry_market_guard_tenths_bps: 500,
    take_profit_market_guard_tenths_bps: 1000,
    stop_loss_market_guard_tenths_bps: 10000,
  }

  await expect.poll(() => validationPayload?.exchange).toBe('hyperliquid')
  expect(validationPayload).toEqual({
    key: '0x1111111111111111111111111111111111111111',
    secret: '',
    network: 'testnet',
    exchange: 'hyperliquid',
    exchange_metadata: expectedMetadata,
    generate_hyperliquid_agent_key: true,
  })
  await expect.poll(() => putPayload?.exchange).toBe('hyperliquid')
  expect(putUrl).toContain('/api/accounts/Hyperliquid%20Live%20QA')
  expect(putPayload).toEqual({
    label: 'Hyperliquid Live QA',
    key: '0x1111111111111111111111111111111111111111',
    secret: '',
    network: 'testnet',
    exchange: 'hyperliquid',
    exchange_metadata: expectedMetadata,
    generate_hyperliquid_agent_key: true,
  })
  await expect(dialog).toBeHidden()
  await expect(accountPanel.getByText('(vault/subaccount)', { exact: true })).toBeVisible()
  await expect(
    accountPanel.getByText('0x4444444444444444444444444444444444444444', { exact: true }),
  ).toBeVisible()
})

test('Hyperliquid account creation accepts a pasted existing agent key', async ({ page }) => {
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  const existingSecret = `0x${'b'.repeat(64)}`
  let validationPayload: Record<string, unknown> | null = null
  let createPayload: Record<string, unknown> | null = null
  let created = false
  await page.route('**/api/accounts**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST' && request.url().includes('/api/accounts/validate')) {
      validationPayload = request.postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          skipped: false,
          exchange: 'hyperliquid',
          network: 'testnet',
          present_permissions: ['Existing agent key valid'],
          missing_requirements: [],
          warnings: [],
        }),
      })
      return
    }
    if (request.method() === 'PUT') {
      createPayload = request.postDataJSON() as Record<string, unknown>
      created = true
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        created
          ? [
              {
                id: '19191919-1919-4919-8919-191919191919',
                label: 'Existing Agent QA',
                key: 'redacted',
                network: 'testnet',
                exchange: 'hyperliquid',
                exchange_metadata: {
                  product: 'usdc_perp',
                  user_address: '0x1111111111111111111111111111111111111111',
                  agent_address: '0x5555555555555555555555555555555555555555',
                  agent_approved: true,
                  agent_approval_verified_at_ms: 1780000000000,
                  builder_fee_tenths_bps: 0,
                },
              },
            ]
          : [],
      ),
    })
  })

  await page.goto('/e2e/bybit-terminal')
  const accountPanel = page.getByTestId('accounts-panel')
  await accountPanel.getByRole('button', { name: 'New' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('select').nth(0).selectOption('testnet')
  await dialog.locator('select').nth(1).selectOption('hyperliquid')
  await dialog.getByRole('button', { name: 'Use existing' }).click()
  await dialog.getByPlaceholder('Account alias').fill('Existing Agent QA')
  await dialog.getByPlaceholder('0x...').fill('0x1111111111111111111111111111111111111111')
  await dialog.getByPlaceholder('32-byte hex private key').fill(existingSecret)
  await dialog.getByLabel('Builder Fee').fill('0')
  await dialog.getByRole('button', { name: 'Check permissions' }).click()
  await expect(dialog.getByText('Existing agent key valid')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect.poll(() => validationPayload?.secret).toBe(existingSecret)
  await expect.poll(() => validationPayload?.generate_hyperliquid_agent_key).toBe(false)
  await expect.poll(() => createPayload?.secret).toBe(existingSecret)
  await expect.poll(() => createPayload?.generate_hyperliquid_agent_key).toBe(false)
  await expect(dialog).toBeHidden()
  await expect(accountPanel.getByRole('button', { name: /Existing Agent QA/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
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
