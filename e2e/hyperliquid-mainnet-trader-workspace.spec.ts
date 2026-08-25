import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const enabled = process.env.HYPERLIQUID_TRADER_WORKSPACE_MAINNET_E2E === '1'
const terminalBaseUrl = process.env.HYPERLIQUID_TERMINAL_BASE_URL || 'http://127.0.0.1:15173'
const email = process.env.HYPERLIQUID_TEST_EMAIL || '668es218pur@gmail.com'
const accountLabel = process.env.HYPERLIQUID_TEST_ACCOUNT_LABEL || 'tester'
const accountId = process.env.HYPERLIQUID_TEST_ACCOUNT_ID || '93b884dc-a1e2-5e45-8568-623c9f14c39e'
const wallet =
  process.env.HYPERLIQUID_TEST_WALLET_ADDRESS || '0x7d6cabebf3ab638ee10e0eabe671bfcfb8336dc3'
const exchangeInfoUrl = 'https://api.hyperliquid.xyz/info'
const resultPath = 'test-results/hyperliquid-mainnet-trader-workspace.json'
let nextInfoRequestAt = 0

type OpenOrder = {
  coin: string
  isTrigger: boolean
  limitPx: string
  oid: number
  orderType: string
  origSz: string
  reduceOnly: boolean
  side: 'A' | 'B'
  sz: string
  triggerPx: string
}

type ClearinghouseState = {
  assetPositions: Array<{ position: { coin: string; szi: string } }>
  marginSummary: { accountValue: string }
}

type Evidence = {
  baseline?: unknown
  workspace?: unknown
  validation?: unknown
  restingLimit?: unknown
  crossingPostOnly?: unknown
  recoveredManagedClose?: unknown
  protectedMarket?: unknown
  protectionAmendment?: unknown
  externalResidual?: unknown
  chase?: unknown
  trailingEntry?: unknown
  trailingEntryImmediate?: unknown
  protectedChase?: unknown
  takeover?: unknown
  feeAdministration?: unknown
}

const evidence: Evidence = {}

test.describe.serial('Hyperliquid Mainnet trader workspace qualification', () => {
  test.skip(!enabled, 'real Mainnet qualification is explicitly gated')

  test.afterAll(() => {
    mkdirSync('test-results', { recursive: true })
    writeFileSync(resultPath, `${JSON.stringify(evidence, null, 2)}\n`)
  })

  test.afterEach(async ({ page, request }) => {
    if (!enabled) return
    const state = await clearinghouseState(request)
    const ethWork = (await openOrders(request)).some((order) => order.coin === 'ETH')
    if (positionSize(state, 'ETH') !== 0 || ethWork || (await hasActiveAction(page, 'ETH'))) {
      await bestEffortSettleManaged(page, request, 'ETH', 0)
      expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    }
    if (Math.abs(positionSize(state, 'BTC') - 0.00069) > 0.000000001) {
      await bestEffortSettleManaged(page, request, 'BTC', 0.00069)
      expect(positionSize(await clearinghouseState(request), 'BTC')).toBeCloseTo(0.00069, 8)
    }
  })

  test('an existing managed position can close without inheriting an entry deadline', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    await login(page)
    const before = positionSize(await clearinghouseState(request), 'ETH')
    test.skip(before === 0, 'one-time recovery scenario has already returned ETH to baseline')

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'close all', exact: true }).first().click()
    await confirmLifecycle(page, 'Close Exposure')
    await waitForPosition(request, 'ETH', (size) => size === 0)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))

    evidence.recoveredManagedClose = {
      symbol: 'ETH',
      before,
      after: 0,
      workingOrdersAfter: 0,
      submittedThroughFrontend: true,
    }
  })

  test('baseline and inline validation are exchange-safe', async ({ page, request }) => {
    test.setTimeout(45_000)
    await login(page)

    const state = await clearinghouseState(request)
    const orders = await openOrders(request)
    expect(nonzeroPositions(state)).toEqual([{ coin: 'BTC', szi: '0.00069' }])
    expect(orders).toEqual([])
    await expect(page.getByText(/^reconciled$/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Active 0', exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByTestId('managed-trade-card')).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByText('0.00069', { exact: true })).toHaveCount(2)

    const form = ticket(page)
    await chooseEntry(form, 'market')
    await symbolField(form).fill('ETH')
    await form.getByRole('button', { name: 'small test', exact: true }).click()
    await form.getByRole('button', { name: '25 USDC', exact: true }).click()
    await form.locator('.stop-toggle input').uncheck()
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await expect(form.locator('button[type="submit"]')).toBeEnabled()

    await amountField(form).fill('banana')
    await expect(form.getByText('quote notional must be a plain decimal number')).toBeVisible()
    await expect(form.locator('button[type="submit"]')).toBeDisabled()

    await amountField(form).fill('1')
    await expect(form.getByText(/minimum notional/i)).toBeVisible()
    await expect(form.locator('button[type="submit"]')).toBeDisabled()
    expect(await openOrders(request)).toEqual([])

    evidence.baseline = {
      accountId,
      positions: nonzeroPositions(state),
      openOrders: orders.length,
      accountValue: state.marginSummary.accountValue,
    }
    evidence.validation = {
      malformedAmountRejected: true,
      belowMinimumRejected: true,
      noExchangeEffect: true,
    }
  })

  test('real workspace navigation, live fields, correlation, and responsive controls are coherent', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000)
    await login(page)
    const stateBefore = await clearinghouseState(request)
    const ordersBefore = await openOrders(request)

    const form = ticket(page)
    await expect(form.getByText(/Live trade .* USDC/)).toBeVisible()
    for (const entry of ['limit', 'chase', 'trailing', 'market'] as const) {
      await chooseEntry(form, entry)
      await expect(form.locator('.entry-tab').filter({ hasText: entry })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
    await chooseEntry(form, 'limit')
    await expect(field(form, 'Limit price')).toBeVisible()
    await chooseEntry(form, 'chase')
    await expect(field(form, 'Timeout')).toBeVisible()
    await chooseEntry(form, 'trailing')
    await expect(field(form, 'Activation price')).toBeVisible()

    await chooseEntry(form, 'market')
    await symbolField(form).fill('ETH')
    await amountField(form).fill('25')
    const mid = Number(await midPrice(request, 'ETH'))
    await field(form, 'Stop-loss price').fill(price(mid * 1.1))
    await form.getByRole('button', { name: 'Add TP', exact: true }).click()
    await field(form, 'Take-profit 1').fill(price(mid * 0.9))
    await expect(form.locator('button[type="submit"]')).toBeDisabled()
    await expect(form.getByText(/take-profit trigger is on the loss side/i)).toBeVisible()
    await form.getByRole('button', { name: 'Remove take profit' }).click()
    await expect(form.getByText(/stop-loss trigger is on the profit side/i)).toBeVisible()

    for (const section of ['Positions', 'Open orders', 'Diagnostics', 'Trades']) {
      await page
        .getByRole('navigation', { name: 'Trading workspace views' })
        .getByRole('button', { name: section, exact: true })
        .click()
      await expect(page.getByText(/^reconciled$/i)).toBeVisible()
    }

    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\//)
    await page.getByRole('link', { name: 'Terminal', exact: true }).click()
    await expect(page).toHaveURL(/\/terminal$/)
    await expect(page.getByText(/^reconciled$/i)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/gateway disconnected/i)).toHaveCount(0)

    await page.getByRole('button', { name: /^Closed \d+$/ }).click()
    const closedCard = page.getByTestId('managed-trade-card').first()
    await expect(closedCard).toBeVisible()
    await closedCard.locator('.trade-expand').click()
    for (const detail of ['Orders & protection', 'devices', 'sequence', 'history']) {
      await closedCard
        .getByRole('navigation', { name: 'Trade details' })
        .getByRole('button', { name: detail, exact: true })
        .click()
    }
    await closedCard.getByRole('button', { name: 'Trade actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Duplicate trade' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('navigation', { name: 'Trade workspace' })).toBeVisible()
    const rail = page.getByTestId('account-identity-rail')
    await expect(rail).toBeVisible()
    expect((await rail.boundingBox())?.height).toBe(20)

    expect(nonzeroPositions(await clearinghouseState(request))).toEqual(nonzeroPositions(stateBefore))
    expect(await openOrders(request)).toEqual(ordersBefore)
    evidence.workspace = {
      livePriceVisible: true,
      entryTabs: ['market', 'limit', 'chase', 'trailing'],
      invalidProtectionRejected: true,
      repeatedNavigationReconciled: true,
      closedTradeEvidenceMounted: true,
      phoneWorkspaceMounted: true,
      noExchangeEffect: true,
    }
  })

  test('resting Limit can be placed, modified, and canceled from the trade card', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)
    await login(page)
    expect(await openOrders(request)).toEqual([])

    const mid = Number(await midPrice(request, 'ETH'))
    const initialPrice = price(mid * 0.9)
    const modifiedPrice = price(mid * 0.89)
    const form = ticket(page)
    await chooseEntry(form, 'limit')
    await symbolField(form).fill('ETH')
    await field(form, 'Limit price').fill(initialPrice)
    await amountField(form).fill('12')
    await form.locator('.stop-toggle input').uncheck()
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH limit accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).last()
    await expect(card).toBeVisible()
    await expect(card.getByText('entering', { exact: true })).toBeVisible()
    const placed = await waitForOpenOrder(request, (order) => order.coin === 'ETH')
    expect(placed.reduceOnly).toBe(false)
    expect(Number(placed.limitPx)).toBe(Number(initialPrice))

    restartLocalNode()
    await login(page, 150_000)
    const recovered = await waitForOpenOrder(request, (order) => order.coin === 'ETH')
    expect(recovered.oid).toBe(placed.oid)
    await expect(card.getByRole('button', { name: 'Modify Order', exact: true })).toBeVisible()

    await card.getByRole('button', { name: 'Modify Order', exact: true }).click()
    const modify = page.getByRole('dialog', { name: 'Modify Order' })
    await field(modify, 'Target Price').fill(modifiedPrice)
    await modify.getByRole('button', { name: 'Modify Order', exact: true }).click()
    await expect(modify).toBeHidden()
    const changed = await waitForOpenOrder(
      request,
      (order) => order.coin === 'ETH' && Number(order.limitPx) === Number(modifiedPrice),
    )
    expect(changed.origSz).toBe(placed.origSz)

    await card.getByRole('button', { name: 'Cancel Order', exact: true }).click()
    const cancel = page.getByRole('dialog', { name: 'Cancel Order' })
    await cancel.getByRole('button', { name: 'Cancel Order', exact: true }).click()
    await expect(cancel).toBeHidden()
    await waitForNoOpenOrders(request)
    await page.getByRole('button', { name: /^Closed \d+$/ }).click()
    const closedCard = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(closedCard.getByText('closed', { exact: true })).toBeVisible()

    evidence.restingLimit = {
      symbol: 'ETH',
      notional: '12',
      initialPrice,
      modifiedPrice,
      placedOid: placed.oid,
      recoveredOid: recovered.oid,
      recoveredAfterNodeRestart: true,
      modifiedOid: changed.oid,
      canceled: true,
    }
  })

  test('crossing post-only Limit rejects without a taker fill', async ({ page, request }) => {
    test.setTimeout(90_000)
    await login(page)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const mid = Number(await midPrice(request, 'ETH'))
    const crossingPrice = significantPrice(mid * 1.05)
    const form = ticket(page)
    await chooseEntry(form, 'limit')
    await symbolField(form).fill('ETH')
    await field(form, 'Limit price').fill(crossingPrice)
    await amountField(form).fill('12')
    await form.locator('.stop-toggle input').uncheck()
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH limit accepted by Trad.')).toBeVisible()

    await page.getByRole('button', { name: /^Closed \d+$/ }).click()
    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(card.getByText('closed', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(card).toContainText(/post.only|would have immediately matched/i)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    evidence.crossingPostOnly = {
      symbol: 'ETH',
      crossingPrice,
      durableCommandAccepted: true,
      exchangeRejectedPostOnly: true,
      takerFill: false,
      finalBase: 0,
      finalWorkingOrders: 0,
    }
  })

  test('protected Market resizes after a partial close and settles after full close', async ({
    page,
    request,
  }) => {
    test.setTimeout(270_000)
    await login(page)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const mid = Number(await midPrice(request, 'ETH'))
    const stopLoss = significantPrice(mid * 0.9)
    const takeProfit = significantPrice(mid * 1.1)
    const form = ticket(page)
    await chooseEntry(form, 'market')
    await symbolField(form).fill('ETH')
    await amountField(form).fill('25')
    await field(form, 'Stop-loss price').fill(stopLoss)
    await form.getByRole('button', { name: 'Add TP', exact: true }).click()
    await field(form, 'Take-profit 1').fill(takeProfit)
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH market accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(card).toBeVisible()
    const opened = await waitForPosition(request, 'ETH', (size) => size > 0)
    const protection = await waitForOrders(
      request,
      (orders) => orders.filter((order) => order.coin === 'ETH').length === 2,
    )
    const ethProtection = protection.filter((order) => order.coin === 'ETH')
    expect(ethProtection.every((order) => !order.reduceOnly && order.side === 'A')).toBe(true)
    expect(ethProtection.filter((order) => order.isTrigger)).toHaveLength(1)
    expect(ethProtection.filter((order) => !order.isTrigger)).toHaveLength(1)
    expect(ethProtection.find((order) => order.isTrigger)?.orderType).toMatch(/stop market/i)
    expect(ethProtection.find((order) => !order.isTrigger)?.orderType).toMatch(/limit/i)

    restartLocalNode()
    await login(page, 150_000)
    const recoveredProtection = await waitForOrders(
      request,
      (orders) => orders.filter((order) => order.coin === 'ETH').length === 2,
    )
    expect(
      recoveredProtection
        .filter((order) => order.coin === 'ETH')
        .map((order) => order.oid)
        .sort(),
    ).toEqual(ethProtection.map((order) => order.oid).sort())
    await expect(card.getByRole('button', { name: 'Close ½', exact: true })).toBeVisible()

    await card.getByRole('button', { name: 'Close ½', exact: true }).click()
    await confirmLifecycle(page, 'Close Exposure')
    const partial = await waitForPosition(request, 'ETH', (size) => size > 0 && size < opened)
    const resized = await waitForOrders(request, (orders) => {
      const current = orders.filter((order) => order.coin === 'ETH')
      return (
        current.length === 2 &&
        current.every((order) => Math.abs(Number(order.sz) - partial) < 0.0000001)
      )
    })

    await card.getByRole('button', { name: 'close all', exact: true }).first().click()
    await confirmLifecycle(page, 'Close Exposure')
    await waitForPosition(request, 'ETH', (size) => size === 0)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))
    await page.getByRole('button', { name: /^Closed \d+$/ }).click()
    await expect(
      page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first().getByText('closed'),
    ).toBeVisible()

    evidence.protectedMarket = {
      symbol: 'ETH',
      notional: '25',
      openedBase: opened,
      partialBase: partial,
      stopLoss,
      takeProfit,
      initialProtectionOrders: ethProtection.map(orderEvidence),
      recoveredProtectionOrders: recoveredProtection
        .filter((order) => order.coin === 'ETH')
        .map(orderEvidence),
      recoveredAfterNodeRestart: true,
      resizedProtectionOrders: resized.filter((order) => order.coin === 'ETH').map(orderEvidence),
      finalBase: 0,
      finalWorkingOrders: 0,
    }
  })

  test('native protection supports a two-TP revision and an adjacent leg move', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000)
    await login(page)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const mid = Number(await midPrice(request, 'ETH'))
    const stopLoss = significantPrice(mid * 0.9)
    const firstTakeProfit = significantPrice(mid * 1.08)
    const secondTakeProfit = significantPrice(mid * 1.12)
    const movedTakeProfit = significantPrice(mid * 1.09)
    const form = ticket(page)
    await chooseEntry(form, 'market')
    await symbolField(form).fill('ETH')
    await amountField(form).fill('30')
    await field(form, 'Stop-loss price').fill(stopLoss)
    await form.getByRole('button', { name: 'Add TP', exact: true }).click()
    await field(form, 'Take-profit 1').fill(firstTakeProfit)
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH market accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    const opened = await waitForPosition(request, 'ETH', (size) => size > 0)
    await waitForOrders(request, (orders) => orders.filter((order) => order.coin === 'ETH').length === 2)
    await card.getByRole('button', { name: 'Edit protection', exact: true }).click()
    let edit = page.getByRole('dialog', { name: 'Edit Native Protection' })
    await edit.getByRole('button', { name: /Take Profit/ }).click()
    await edit.getByRole('textbox', { name: 'TP 2 Trigger' }).fill(secondTakeProfit)
    await edit.getByRole('button', { name: 'Apply Protection', exact: true }).click()
    await expect(edit).toBeHidden()
    const revised = await waitForOrders(
      request,
      (orders) => orders.filter((order) => order.coin === 'ETH').length === 3,
    )
    const revisedEth = revised.filter((order) => order.coin === 'ETH')
    expect(revisedEth.filter((order) => order.isTrigger)).toHaveLength(1)
    expect(revisedEth.filter((order) => !order.isTrigger)).toHaveLength(2)

    const move = card.getByRole('button', { name: 'move', exact: true }).first()
    await expect(move).toBeEnabled({ timeout: 30_000 })
    await move.click()
    edit = page.getByRole('dialog', { name: 'Edit Native Protection' })
    await edit.getByRole('textbox', { name: 'TP 1 Trigger' }).fill(movedTakeProfit)
    await edit.getByRole('button', { name: 'Apply Protection', exact: true }).click()
    await expect(edit).toBeHidden()
    const moved = await waitForOrders(request, (orders) => {
      const current = orders.filter((order) => order.coin === 'ETH')
      return (
        current.length === 3 &&
        current.some(
          (order) => !order.isTrigger && Number(order.limitPx) === Number(movedTakeProfit),
        )
      )
    })

    await card.getByRole('button', { name: 'close all', exact: true }).first().click()
    await confirmLifecycle(page, 'Close Exposure')
    await waitForPosition(request, 'ETH', (size) => size === 0)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))

    evidence.protectionAmendment = {
      symbol: 'ETH',
      openedBase: opened,
      stopLoss,
      initialTakeProfit: firstTakeProfit,
      secondTakeProfit,
      movedTakeProfit,
      revisedOrders: revisedEth.map(orderEvidence),
      movedOrders: moved.filter((order) => order.coin === 'ETH').map(orderEvidence),
      finalBase: 0,
      finalWorkingOrders: 0,
    }
  })

  test('one-way managed BTC closes preserve the exact external wallet residual', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000)
    await login(page)
    const baseline = positionSize(await clearinghouseState(request), 'BTC')
    expect(baseline).toBeCloseTo(0.00069, 8)
    expect((await openOrders(request)).filter((order) => order.coin === 'BTC')).toEqual([])

    const mid = Number(await midPrice(request, 'BTC'))
    const stopLoss = significantPrice(mid * 0.9)
    const takeProfit = significantPrice(mid * 1.1)
    const form = ticket(page)
    await chooseEntry(form, 'market')
    await symbolField(form).fill('BTC')
    await amountField(form).fill('25')
    await field(form, 'Stop-loss price').fill(stopLoss)
    await form.getByRole('button', { name: 'Add TP', exact: true }).click()
    await field(form, 'Take-profit 1').fill(takeProfit)
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy BTC market accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'BTC' }).first()
    await expect(card).toBeVisible()
    const openedNet = await waitForPosition(request, 'BTC', (size) => size > baseline)
    const managed = openedNet - baseline
    const protection = await waitForOrders(request, (orders) => {
      const current = orders.filter((order) => order.coin === 'BTC')
      return (
        current.length === 2 &&
        current.every((order) => Math.abs(Number(order.sz) - managed) < 0.00000001)
      )
    })

    await card.getByRole('button', { name: 'Close ½', exact: true }).click()
    await confirmLifecycle(page, 'Close Exposure')
    const partialNet = await waitForPosition(
      request,
      'BTC',
      (size) => size > baseline && size < openedNet,
    )
    const remainingManaged = partialNet - baseline
    await waitForOrders(request, (orders) => {
      const current = orders.filter((order) => order.coin === 'BTC')
      return (
        current.length === 2 &&
        current.every((order) => Math.abs(Number(order.sz) - remainingManaged) < 0.00000001)
      )
    })

    await card.getByRole('button', { name: 'close all', exact: true }).first().click()
    await confirmLifecycle(page, 'Close Exposure')
    const finalNet = await waitForPosition(
      request,
      'BTC',
      (size) => Math.abs(size - baseline) < 0.000000001,
    )
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'BTC'))
    await expect(page.getByText(/^reconciled$/i)).toBeVisible({ timeout: 20_000 })

    evidence.externalResidual = {
      symbol: 'BTC',
      baseline,
      openedNet,
      managedBase: managed,
      partialNet,
      remainingManaged,
      initialProtectionOrders: protection.filter((order) => order.coin === 'BTC').map(orderEvidence),
      finalNet,
      finalWorkingOrders: 0,
      externalResidualPreserved: true,
    }
  })

  test('post-only Chase maintains one live child and cancels without replacement', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)
    await login(page)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const form = ticket(page)
    await chooseEntry(form, 'chase')
    await symbolField(form).fill('ETH')
    await amountField(form).fill('12')
    await form.getByRole('textbox', { name: /Timeout \(seconds\)/ }).fill('60')
    await form.locator('.stop-toggle input').uncheck()
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH chase accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(card).toBeVisible()
    const observedOids = new Set<number>()
    let maximumConcurrent = 0
    const sampleDeadline = Date.now() + 3_000
    while (Date.now() < sampleDeadline) {
      const current = (await openOrders(request)).filter((order) => order.coin === 'ETH')
      maximumConcurrent = Math.max(maximumConcurrent, current.length)
      current.forEach((order) => observedOids.add(order.oid))
      if (positionSize(await clearinghouseState(request), 'ETH') !== 0) break
      await new Promise((resolve) => setTimeout(resolve, 125))
    }
    expect(maximumConcurrent).toBeLessThanOrEqual(1)

    const filled = positionSize(await clearinghouseState(request), 'ETH') !== 0
    if (filled) {
      await card.getByRole('button', { name: 'close all', exact: true }).first().click()
      await confirmLifecycle(page, 'Close Exposure')
      await waitForPosition(request, 'ETH', (size) => size === 0)
    } else {
      await card.getByRole('button', { name: 'Cancel Chase', exact: true }).click()
      await confirmLifecycle(page, 'Cancel Chase')
    }
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    await expect(page.getByText(/^reconciled$/i)).toBeVisible({ timeout: 20_000 })

    evidence.chase = {
      symbol: 'ETH',
      notional: '12',
      postOnly: true,
      observedExchangeOrderIds: [...observedOids],
      maximumConcurrentChildren: maximumConcurrent,
      filledBeforeCancellation: filled,
      finalBase: 0,
      finalWorkingOrders: 0,
      noPostCancelReplacement: true,
    }
  })

  test('risk-sized protected Chase carries proportional protection and duplicates authored intent', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000)
    await login(page)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const mid = Number(await midPrice(request, 'ETH'))
    const stopLoss = significantPrice(mid * 0.9)
    const takeProfits = [
      significantPrice(mid * 1.08),
      significantPrice(mid * 1.12),
      significantPrice(mid * 1.16),
    ]
    const form = ticket(page)
    await chooseEntry(form, 'chase')
    await symbolField(form).fill('ETH')
    await form.getByRole('button', { name: 'Size by risk', exact: true }).click()
    await amountField(form).fill('3.8')
    await field(form, 'Stop-loss price').fill(stopLoss)
    for (let index = 0; index < takeProfits.length; index += 1) {
      await form.getByRole('button', { name: 'Add TP', exact: true }).click()
      const row = form.locator('.tp-row').nth(index)
      await row.locator('input').first().fill(takeProfits[index]!)
      await row.locator('select').selectOption('fraction')
      await row.locator('input').last().fill(index === 2 ? '40' : '30')
    }
    await form.getByRole('textbox', { name: /Timeout \(seconds\)/ }).fill('60')
    await expect(form.getByText('Ready', { exact: true })).toBeVisible({ timeout: 20_000 })
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH chase accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(card).toBeVisible()
    const observedPositions = new Set<number>()
    const observedLegStates = new Set<string>()
    const observationDeadline = Date.now() + 45_000
    while (Date.now() < observationDeadline) {
      const size = positionSize(await clearinghouseState(request), 'ETH')
      observedPositions.add(size)
      for (const text of await card.locator('.leg-size').allInnerTexts()) observedLegStates.add(text)
      if (size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3_000))
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    const cancel = card.getByRole('button', { name: 'Cancel Chase', exact: true })
    if (await cancel.isVisible()) {
      await cancel.click()
      await confirmLifecycle(page, 'Cancel Chase')
    }
    const established = positionSize(await clearinghouseState(request), 'ETH')
    const protection = established > 0
      ? await waitForOrders(request, (orders) => {
          const current = orders.filter((order) => order.coin === 'ETH')
          return current.some((order) => order.isTrigger)
        })
      : await openOrders(request)

    await card.getByRole('button', { name: 'Trade actions' }).click()
    await page.getByRole('menuitem', { name: 'Duplicate trade' }).click()
    await expect(
      form.getByText('Duplicated trade loaded. Review it before submitting.'),
    ).toBeVisible()
    await expect(form.locator('.entry-tab').filter({ hasText: 'chase' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(form.getByRole('button', { name: 'Size by risk', exact: true })).toHaveClass(
      /active/,
    )
    await expect(amountField(form)).toHaveValue('3.8')
    await expect(form.locator('.tp-row')).toHaveCount(3)
    await expect(form.locator('.tp-row').nth(0).locator('input').last()).toHaveValue('30')
    await expect(form.locator('.tp-row').nth(1).locator('input').last()).toHaveValue('30')
    await expect(form.locator('.tp-row').nth(2).locator('input').last()).toHaveValue('40')

    if (established > 0) {
      const livePnl = card.locator('.metric-pnl')
      await expect(livePnl).toContainText('P&L · USDC', { timeout: 20_000 })
      await expect(livePnl).not.toContainText('unavailable', { timeout: 20_000 })
      await card.getByRole('button', { name: 'close all', exact: true }).first().click()
      await confirmLifecycle(page, 'Close Exposure')
      await waitForPosition(request, 'ETH', (size) => size === 0)
    }
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))

    evidence.protectedChase = {
      symbol: 'ETH',
      riskAtStop: '3.8',
      stopLoss,
      takeProfits: takeProfits.map((trigger, index) => ({
        trigger,
        allocationPercent: index === 2 ? 40 : 30,
      })),
      observedPositionSizes: [...observedPositions],
      establishedBase: established,
      observedProtectionStates: [...observedLegStates],
      protectionOrders: protection.filter((order) => order.coin === 'ETH').map(orderEvidence),
      duplicatePreservedAuthoredIntent: true,
      livePnlScopedToTrade: established > 0,
      finalBase: 0,
      finalWorkingOrders: 0,
    }
  })

  test('Take Over detaches management without closing venue exposure', async ({ page, request }) => {
    test.setTimeout(180_000)
    await login(page)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const form = ticket(page)
    await chooseEntry(form, 'market')
    await symbolField(form).fill('ETH')
    await amountField(form).fill('12')
    await form.locator('.stop-toggle input').uncheck()
    await expect(form.getByText('Ready', { exact: true })).toBeVisible({ timeout: 20_000 })
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH market accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    const opened = await waitForPosition(request, 'ETH', (size) => size > 0)
    await expect(card.getByRole('button', { name: 'Take over', exact: true })).toBeVisible()
    await card.getByRole('button', { name: 'Take over', exact: true }).click()
    await confirmLifecycle(page, 'Stop Managing (Take Over)')
    await expect
      .poll(async () => positionSize(await clearinghouseState(request), 'ETH'), {
        timeout: 30_000,
      })
      .toBeCloseTo(opened, 8)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))

    await flattenSymbol(page, 'ETH')
    await waitForPosition(request, 'ETH', (size) => size === 0)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))

    evidence.takeover = {
      symbol: 'ETH',
      openedBase: opened,
      baseImmediatelyAfterTakeover: opened,
      managementDetachedWithoutVenueClose: true,
      cleanup: 'separate symbol Flatten',
      finalBase: 0,
      finalWorkingOrders: 0,
    }
  })

  test('fee administration exposes hierarchy, durable fills, revenue, and audit', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page)
    await page.getByRole('link', { name: 'Admin', exact: true }).click()
    await page.getByRole('link', { name: 'Fees', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Fees', exact: true })).toBeVisible()

    const tabs = page.getByRole('navigation', { name: 'Fee administration' })
    for (const name of [
      'Overview',
      'Users',
      'Accounts',
      'Active trade policy',
      'Revenue & fees',
      'Audit',
    ]) {
      await expect(tabs.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await tabs.getByRole('button', { name: 'Users', exact: true }).click()
    await page.getByPlaceholder('Search email, user ID, or role').fill(email)
    await expect(page.getByRole('cell', { name: email, exact: true })).toBeVisible()

    await tabs.getByRole('button', { name: 'Accounts', exact: true }).click()
    await page
      .getByPlaceholder('Search owner, label, account ID, exchange, or network')
      .fill(accountLabel)
    await expect(page.getByRole('cell', { name: accountLabel, exact: true })).toBeVisible()

    await tabs.getByRole('button', { name: 'Revenue & fees', exact: true }).click()
    await expect(page.getByText('Trad builder revenue', { exact: true })).toBeVisible()
    await page
      .getByPlaceholder('Filter by user, account, symbol, phase, or liquidity')
      .fill(accountLabel)
    await expect(
      page.getByRole('row').filter({ hasText: email }).filter({ hasText: accountLabel }).first(),
    ).toBeVisible()

    await tabs.getByRole('button', { name: 'Audit', exact: true }).click()
    await expect(page.getByText('Fee policy audit', { exact: true })).toBeVisible()
    evidence.feeAdministration = {
      hierarchyTabs: true,
      serverFilteredUsers: true,
      serverFilteredAccounts: true,
      durableRevenueRows: true,
      feeAudit: true,
    }
  })

  test('Trailing Entry edits, reloads, charts, and cancels durably before activation', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000)
    await login(page)
    if (await hasActiveAction(page, 'ETH')) await bestEffortSettleManaged(page, request, 'ETH', 0)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const mid = Number(await midPrice(request, 'ETH'))
    const activation = significantPrice(mid * 0.8)
    const amendedActivation = significantPrice(mid * 0.79)
    const stopLoss = significantPrice(mid * 0.7)
    const takeProfit = significantPrice(mid * 1.1)
    const form = ticket(page)
    await chooseEntry(form, 'trailing')
    await symbolField(form).fill('ETH')
    await amountField(form).fill('2')
    await field(form, 'Activation price').fill(activation)
    await field(form, 'Jump threshold').fill('10')
    await field(form, 'Stop-loss price').fill(stopLoss)
    await form.getByRole('button', { name: 'Add TP', exact: true }).click()
    await field(form, 'Take-profit 1').fill(takeProfit)
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH trailing accepted by Trad.')).toBeVisible()

    let card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(card.getByText('entering', { exact: true })).toBeVisible()
    await expect(card.getByTestId('managed-trade-chart')).toBeVisible()
    await card.locator('.trade-expand').click()
    await card
      .getByRole('navigation', { name: 'Trade details' })
      .getByRole('button', { name: 'chart', exact: true })
      .click()
    await expect(card.getByTestId('engine-te-chart')).toBeVisible()
    await expect(card.locator('canvas')).not.toHaveCount(0)

    const editAction = card.getByRole('button', { name: 'Edit', exact: true })
    await expect(editAction).toBeVisible({ timeout: 30_000 })
    await editAction.click()
    const edit = page.getByRole('dialog', { name: 'Edit' })
    await edit.getByRole('textbox', { name: /Activation Price/ }).fill(amendedActivation)
    await edit.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(edit).toBeHidden()

    await page.reload()
    await expect(page.getByText(/^reconciled$/i)).toBeVisible({ timeout: 20_000 })
    card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    await expect(card.getByText('entering', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: 'Cancel Entry', exact: true }).click()
    await confirmLifecycle(page, 'Cancel Entry')
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    await page.getByRole('button', { name: /^Closed \d+$/ }).click()
    await expect(
      page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first().getByText('closed'),
    ).toBeVisible()

    evidence.trailingEntry = {
      symbol: 'ETH',
      activation,
      amendedActivation,
      jumpBasisPoints: '10',
      riskAtStop: '2',
      stopLoss,
      takeProfit,
      liveChartMounted: true,
      recoveredAfterReload: true,
      canceledBeforeActivation: true,
      finalBase: 0,
      finalWorkingOrders: 0,
    }
  })

  test('Trailing Entry Enter Now establishes protected managed exposure and closes cleanly', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000)
    await login(page)
    expect(positionSize(await clearinghouseState(request), 'ETH')).toBe(0)
    expect((await openOrders(request)).filter((order) => order.coin === 'ETH')).toEqual([])

    const mid = Number(await midPrice(request, 'ETH'))
    const activation = significantPrice(mid * 0.8)
    const stopLoss = significantPrice(mid * 0.7)
    const takeProfit = significantPrice(mid * 1.1)
    const form = ticket(page)
    await chooseEntry(form, 'trailing')
    await symbolField(form).fill('ETH')
    await amountField(form).fill('5')
    await field(form, 'Activation price').fill(activation)
    await field(form, 'Jump threshold').fill('10')
    await field(form, 'Stop-loss price').fill(stopLoss)
    await form.getByRole('button', { name: 'Add TP', exact: true }).click()
    await field(form, 'Take-profit 1').fill(takeProfit)
    await expect(form.getByText('Ready', { exact: true })).toBeVisible()
    await form.locator('button[type="submit"]').click()
    await expect(form.getByText('Buy ETH trailing accepted by Trad.')).toBeVisible()

    const card = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    const enterNow = card.getByRole('button', { name: 'Enter Now', exact: true })
    await expect(enterNow).toBeVisible({ timeout: 30_000 })
    await enterNow.click()
    await confirmLifecycle(page, 'Enter Now')
    const opened = await waitForPosition(request, 'ETH', (size) => size > 0)
    const protection = await waitForOrders(
      request,
      (orders) => orders.filter((order) => order.coin === 'ETH').length === 2,
    )
    expect(
      protection
        .filter((order) => order.coin === 'ETH')
        .every((order) => Math.abs(Number(order.sz) - opened) < 0.0000001),
    ).toBe(true)

    const activeCard = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
    const closePosition = activeCard.getByRole('button', { name: 'Close Position', exact: true })
    await expect(closePosition).toBeVisible({ timeout: 30_000 })
    await closePosition.click()
    await confirmLifecycle(page, 'Close Position')
    await waitForPosition(request, 'ETH', (size) => size === 0)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== 'ETH'))

    evidence.trailingEntryImmediate = {
      symbol: 'ETH',
      riskAtStop: '5',
      openedBase: opened,
      protectionOrders: protection.filter((order) => order.coin === 'ETH').map(orderEvidence),
      finalBase: 0,
      finalWorkingOrders: 0,
    }
  })
})

async function login(page: Page, reconciliationTimeout = 20_000): Promise<void> {
  const target = `${terminalBaseUrl}/auth/test-login?email=${encodeURIComponent(email)}&return_to=%2Fterminal`
  await page.goto(target)
  await page.waitForURL('**/terminal')
  await expect(
    page.getByRole('button', {
      name: new RegExp(`switch trading account: ${accountLabel}`, 'i'),
    }),
  ).toBeVisible()
  await expect(page.getByText(/^reconciled$/i)).toBeVisible({ timeout: reconciliationTimeout })
}

function restartLocalNode(): void {
  execFileSync('systemctl', ['--user', 'restart', 'trad-settings-node'], { timeout: 30_000 })
}

function ticket(page: Page): Locator {
  return page.getByRole('form', { name: 'New trade order ticket' })
}

async function chooseEntry(form: Locator, name: 'market' | 'limit' | 'chase' | 'trailing') {
  await form.locator('.entry-tab').filter({ hasText: name }).click()
}

function symbolField(form: Locator): Locator {
  return form.getByRole('combobox', { name: /market/i }).first()
}

function amountField(form: Locator): Locator {
  return form
    .locator('label')
    .filter({ hasText: /(?:NOTIONAL|BASE QUANTITY|RISK LOST AT SL)/i })
    .locator('input')
    .last()
}

function field(scope: Locator, label: string): Locator {
  return scope
    .locator('label')
    .filter({ hasText: new RegExp(label, 'i') })
    .locator('input')
    .last()
}

async function info<T>(request: APIRequestContext, body: unknown): Promise<T> {
  const type = (body as { type?: unknown }).type
  const weight = type === 'frontendOpenOrders' ? 20 : 2
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const pacingDelay = nextInfoRequestAt - Date.now()
    if (pacingDelay > 0) await new Promise((resolve) => setTimeout(resolve, pacingDelay))
    // Keep evidence reads under 240 weighted units/minute so the observer
    // cannot starve Trad's own maintenance and effect lanes on the same host.
    nextInfoRequestAt = Date.now() + weight * 250
    const response = await request.post(exchangeInfoUrl, { data: body })
    if (response.ok()) {
      const payload: unknown = await response.json()
      return payload as T
    }
    const status = response.status()
    const detail = await response.text()
    if (status !== 429 && status < 500) {
      throw new Error(`Hyperliquid info request failed with HTTP ${status}: ${detail}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt))
  }
  throw new Error('Hyperliquid info request remained rate-limited after bounded backoff')
}

async function clearinghouseState(request: APIRequestContext): Promise<ClearinghouseState> {
  return info<ClearinghouseState>(request, { type: 'clearinghouseState', user: wallet })
}

async function openOrders(request: APIRequestContext): Promise<OpenOrder[]> {
  return info<OpenOrder[]>(request, { type: 'frontendOpenOrders', user: wallet })
}

async function midPrice(request: APIRequestContext, symbol: string): Promise<string> {
  const mids = await info<Record<string, string>>(request, { type: 'allMids' })
  const value = mids[symbol]
  if (typeof value !== 'string') throw new Error(`No ${symbol} mid returned by Hyperliquid`)
  return value
}

function nonzeroPositions(state: ClearinghouseState): Array<{ coin: string; szi: string }> {
  return state.assetPositions
    .map((row) => ({ coin: row.position.coin, szi: row.position.szi }))
    .filter((row: { szi: string }) => row.szi !== '0')
}

function positionSize(state: ClearinghouseState, symbol: string): number {
  const row = state.assetPositions.find((candidate) => candidate.position.coin === symbol)
  return row === undefined ? 0 : Number(row.position.szi)
}

function orderEvidence(order: OpenOrder) {
  return {
    oid: order.oid,
    orderType: order.orderType,
    reduceOnly: order.reduceOnly,
    size: order.sz,
    trigger: order.triggerPx,
  }
}

function price(value: number): string {
  return (Math.floor(value * 10) / 10).toFixed(1)
}

function significantPrice(value: number): string {
  return String(Number(value.toPrecision(5)))
}

async function waitForOpenOrder(
  request: APIRequestContext,
  predicate: (order: OpenOrder) => boolean,
): Promise<OpenOrder> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const match = (await openOrders(request)).find(predicate)
    if (match !== undefined) return match
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Hyperliquid did not expose the expected working order within 20 seconds')
}

async function waitForNoOpenOrders(request: APIRequestContext): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if ((await openOrders(request)).length === 0) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Hyperliquid still has working orders after 20 seconds')
}

async function waitForOrders(
  request: APIRequestContext,
  predicate: (orders: OpenOrder[]) => boolean,
): Promise<OpenOrder[]> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const orders = await openOrders(request)
    if (predicate(orders)) return orders
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Hyperliquid working orders did not reach the expected state within 30 seconds')
}

async function waitForPosition(
  request: APIRequestContext,
  symbol: string,
  predicate: (size: number) => boolean,
): Promise<number> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const size = positionSize(await clearinghouseState(request), symbol)
    if (predicate(size)) return size
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${symbol} position did not reach the expected state within 30 seconds`)
}

async function confirmLifecycle(page: Page, title: string): Promise<void> {
  const modal = page.getByRole('dialog', { name: title })
  await expect(modal).toBeVisible()
  const checkbox = modal.getByRole('checkbox')
  if ((await checkbox.count()) > 0) await checkbox.check()
  await modal.getByRole('button', { name: title, exact: true }).click()
  const rejection = modal.locator('.submission-error')
  await expect
    .poll(
      async () => {
        if (!(await modal.isVisible())) return 'accepted'
        if (await rejection.isVisible()) return `rejected: ${await rejection.innerText()}`
        return 'pending'
      },
      { timeout: 15_000 },
    )
    .not.toBe('pending')
  if (await rejection.isVisible()) throw new Error(await rejection.innerText())
}

async function hasActiveAction(page: Page, symbol: 'BTC' | 'ETH'): Promise<boolean> {
  if (!page.url().includes('/terminal')) return false
  const blockingDialog = page.getByRole('dialog')
  if (await blockingDialog.isVisible()) {
    await page.keyboard.press('Escape')
    if (await blockingDialog.isVisible()) await page.reload()
  }
  const active = page.getByRole('button', { name: /^Active \d+$/ })
  if (await active.isVisible()) await active.click()
  const card = page.getByTestId('managed-trade-card').filter({ hasText: symbol }).first()
  if (!(await card.isVisible())) return false
  return (
    (await card.getByRole('button', { name: 'close all', exact: true }).first().isVisible()) ||
    (await card.getByRole('button', { name: 'Close Position', exact: true }).isVisible()) ||
    (await card.getByRole('button', { name: 'Cancel Chase', exact: true }).isVisible()) ||
    (await card.getByRole('button', { name: 'Cancel Entry', exact: true }).isVisible())
  )
}

async function bestEffortSettleManaged(
  page: Page,
  request: APIRequestContext,
  symbol: 'BTC' | 'ETH',
  target: number,
): Promise<void> {
  if (!page.url().includes('/terminal')) await page.goto(`${terminalBaseUrl}/terminal`)
  const blockingDialog = page.getByRole('dialog')
  if (await blockingDialog.isVisible()) {
    await page.keyboard.press('Escape')
    if (await blockingDialog.isVisible()) await page.reload()
  }
  const active = page.getByRole('button', { name: /^Active \d+$/ })
  if (await active.isVisible()) await active.click()
  const cards = page.getByTestId('managed-trade-card').filter({ hasText: symbol })
  await cards.first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined)
  for (let index = 0; index < (await cards.count()); index += 1) {
    const card = cards.nth(index)
    const choices = [
      {
        button: card.getByRole('button', { name: 'close all', exact: true }).first(),
        title: 'Close Exposure',
      },
      {
        button: card.getByRole('button', { name: 'Close Position', exact: true }),
        title: 'Close Position',
      },
      { button: card.getByRole('button', { name: 'Cancel Chase', exact: true }), title: 'Cancel Chase' },
      { button: card.getByRole('button', { name: 'Cancel Entry', exact: true }), title: 'Cancel Entry' },
    ]
    let selected: (typeof choices)[number] | undefined
    for (const candidate of choices) {
      if (await candidate.button.isVisible()) {
        selected = candidate
        break
      }
    }
    if (selected === undefined) continue
    await selected.button.click()
    await confirmLifecycle(page, selected.title)
    await waitForPosition(request, symbol, (size) => Math.abs(size - target) < 0.000000001)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== symbol))
    return
  }
  if (target === 0) {
    await flattenSymbol(page, symbol)
    await waitForPosition(request, symbol, (size) => Math.abs(size) < 0.000000001)
    await waitForOrders(request, (orders) => orders.every((order) => order.coin !== symbol))
    return
  }
  throw new Error(`Campaign cleanup could not find the Trad-owned ${symbol} close action`)
}

async function flattenSymbol(page: Page, symbol: 'BTC' | 'ETH'): Promise<void> {
  await page.getByRole('button', { name: /^commands/i }).click()
  const palette = page.getByRole('dialog')
  await palette.getByPlaceholder('Search commands').fill('flatten')
  await palette.getByRole('button', { name: /Flatten Exposure/ }).click()
  const modal = page.getByRole('dialog', { name: 'Flatten Exposure' })
  await modal.getByRole('combobox', { name: 'Target' }).selectOption('symbol')
  await modal.getByRole('combobox', { name: 'Symbol' }).fill(symbol)
  await modal.locator('.market-combobox-option').first().click()
  await modal.getByRole('button', { name: /^flatten$/i }).click()
  await expect(modal).toBeHidden({ timeout: 20_000 })
}
