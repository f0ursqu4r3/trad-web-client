import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { installVisibilitySwitch, openWorkspace, setTabHidden } from './support/workspaceWire'

// Hyperliquid drops the whole shared price connection when asked for a coin
// that does not exist. The market picker therefore only filters while the
// trader types; the ticket's market and its price subscription change when a
// market is selected (click, Enter, or leaving the field on an exact match).

function ticketParts(page: Page) {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  return {
    ticket,
    market: ticket.getByRole('combobox', { name: /market/i }).first(),
    price: ticket.locator('.market-price').first(),
    hint: ticket.getByText('press Enter to select', { exact: true }),
  }
}

test('typing a ticker without selecting it sends no subscription', async ({ page }) => {
  const wire = await openWorkspace(page)
  const { market, price, hint } = ticketParts(page)
  await expect.poll(() => [...wire.subscribes].sort()).toEqual(['BTC', 'ETH', 'SOL'])
  await expect(price).toContainText('2,100')
  const before = wire.subscribes.length

  await market.selectText()
  await market.pressSequentially('ZEC', { delay: 60 })
  await expect(market).toHaveValue('ZEC')
  await expect(hint).toBeVisible()
  // The ticket keeps showing its selected market's price meanwhile.
  await expect(price).toContainText('2,100')
  await expect(price).not.toContainText('unavailable')
  await page.waitForTimeout(1_000)

  expect(wire.subscribes.slice(before)).toEqual([])
  expect(wire.unsubscribes).toEqual([])
})

test('Enter selects the typed market and subscribes it once', async ({ page }) => {
  const wire = await openWorkspace(page)
  const { market, price, hint } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)
  await expect(price).toContainText('2,100')

  await market.selectText()
  await market.pressSequentially('ZEC', { delay: 30 })
  await market.press('Enter')
  await expect(price).toContainText('41.25')
  await expect(hint).toHaveCount(0)
  await page.waitForTimeout(800)

  expect(wire.subscribes.slice(3)).toEqual(['ZEC'])
  // The trade cards keep BTC, ETH and SOL: the ticket only released its own
  // BTC demand, so nothing was unsubscribed or resubscribed.
  expect(wire.unsubscribes).toEqual([])
})

test('clicking an option selects it and subscribes it once', async ({ page }) => {
  const wire = await openWorkspace(page)
  const { ticket, market, price } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)

  await market.selectText()
  await market.pressSequentially('Z', { delay: 30 })
  await page.waitForTimeout(500)
  expect(wire.subscribes.length).toBe(3)
  await ticket.getByRole('option', { name: /ZEC/ }).click()
  await expect(market).toHaveValue('ZEC')
  await expect(price).toContainText('41.25')
  await page.waitForTimeout(800)

  expect(wire.subscribes.slice(3)).toEqual(['ZEC'])
  expect(wire.unsubscribes).toEqual([])
})

test('leaving the field on an exact listed match selects it', async ({ page }) => {
  const wire = await openWorkspace(page)
  const { ticket, market, price } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)

  await market.selectText()
  await market.pressSequentially('ZEC', { delay: 30 })
  await market.press('Tab')
  await expect(market).not.toBeFocused()
  await expect(ticket.getByText('press Enter to select', { exact: true })).toHaveCount(0)
  await expect(price).toContainText('41.25')
  await expect.poll(() => wire.subscribes.slice(3)).toEqual(['ZEC'])
})

test('an unlisted ticker is never subscribed and keeps the selected market', async ({ page }) => {
  const wire = await openWorkspace(page)
  const { ticket, market, price } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)

  await market.selectText()
  await market.pressSequentially('ZZZ', { delay: 30 })
  await market.press('Enter')
  await market.press('Tab')
  await expect(ticket.getByText('ZZZ is not available for this account')).toBeVisible()
  await expect(price).toContainText('2,100')
  await expect(ticket.getByText(/press Enter to select it/)).toBeVisible()
  await page.waitForTimeout(800)
  expect(wire.subscribes.length).toBe(3)
  expect(wire.unsubscribes).toEqual([])
})

for (const [name, error] of [
  ['unknown_market', { kind: 'unknown_market', reason: 'ZE is not listed' }],
  [
    'non-retryable unavailable',
    { kind: 'unavailable', reason: 'unknown coin ZE', retryable: false },
  ],
] as const) {
  test(`a refused ${name} symbol is shown as Unknown market and never retried`, async ({
    page,
  }) => {
    await page.clock.install()
    const wire = await openWorkspace(page, {
      // Without a catalog the typed symbol is manual entry and the gateway is
      // its judge.
      catalog: false,
      marketError: (symbol) => (symbol === 'ZE' ? error : null),
    })
    const { market, price } = ticketParts(page)
    await expect.poll(() => wire.subscribes.length).toBe(3)

    await market.selectText()
    await market.pressSequentially('ZE')
    await page.clock.runFor(1_000)
    expect(wire.subscribes.length).toBe(3)
    await market.press('Enter')
    await page.clock.runFor(400)
    await expect(price).toHaveText('Unknown market')
    await page.clock.runFor(120_000)
    expect(wire.subscribes.filter((symbol) => symbol === 'ZE')).toEqual(['ZE'])
    expect(wire.subscribes.length).toBe(4)
  })
}

test('a pending retry for a symbol the ticket moved past never resubscribes it', async ({
  page,
}) => {
  await page.clock.install()
  const wire = await openWorkspace(page, {
    catalog: false,
    marketError: (symbol) =>
      symbol === 'ZE' ? { kind: 'unavailable', reason: 'feed busy', retryable: true } : null,
  })
  const { market, price } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)

  await market.selectText()
  await market.pressSequentially('ZE')
  await market.press('Enter')
  await page.clock.runFor(400)
  await expect.poll(() => wire.subscribes.slice(3)).toEqual(['ZE'])
  await market.press('End')
  await market.pressSequentially('C')
  await market.press('Enter')
  await page.clock.runFor(400)
  await expect(price).toContainText('41.25')
  await page.clock.runFor(120_000)

  expect(wire.subscribes.slice(3)).toEqual(['ZE', 'ZEC'])
  expect(wire.unsubscribes).toEqual([])
})

test('a background-tab round trip keeps every subscription and refetches accounts at most once', async ({
  page,
}) => {
  await installVisibilitySwitch(page)
  const wire = await openWorkspace(page)
  const { price } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)
  await expect(price).toContainText('2,100')
  await expect.poll(() => wire.accountSubscribes).toBe(1)
  const fetchesBefore = wire.accountFetches

  for (let round = 0; round < 3; round += 1) {
    await setTabHidden(page, true)
    expect(wire.sendSamples('ETH', 3)).toBe(true)
    wire.sendDelta()
    await page.waitForTimeout(200)
    await setTabHidden(page, false)
    await page.waitForTimeout(200)
  }

  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  expect(wire.subscribes.length).toBe(3)
  expect(wire.unsubscribes).toEqual([])
  expect(wire.accountSubscribes).toBe(1)
  // Focus and visibility together, three times over: one refresh at most.
  expect(wire.accountFetches - fetchesBefore).toBeLessThanOrEqual(1)
})

test('market samples that arrive while hidden apply in one update on return', async ({ page }) => {
  await installVisibilitySwitch(page)
  const wire = await openWorkspace(page)
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await expect.poll(() => wire.markets.has('ETH')).toBe(true)

  await setTabHidden(page, true)
  for (let message = 0; message < 40; message += 1) wire.sendSamples('ETH', 2)
  await page.waitForTimeout(300)
  // Nothing reached the store while hidden: the window still ends at the
  // initial sample.
  expect(await appliedNextSequence(page, 'ETH')).toBe(2)

  await setTabHidden(page, false)
  await expect.poll(() => appliedNextSequence(page, 'ETH')).toBe(82)
  await expect(eth).toBeVisible()
  expect(wire.subscribes.length).toBe(3)
})

// Where the market store's window for `symbol` ends.
async function appliedNextSequence(page: Page, symbol: string): Promise<number | null> {
  return page.evaluate((wanted) => {
    interface Streams {
      [key: string]: { symbol: string; nextSequence: number | null }
    }
    const root = document.querySelector('#app') as unknown as {
      __vue_app__: {
        config: {
          globalProperties: { $pinia: { state: { value: { market: { streams: Streams } } } } }
        }
      }
    }
    const streams = root.__vue_app__.config.globalProperties.$pinia.state.value.market.streams
    return Object.values(streams).find((stream) => stream.symbol === wanted)?.nextSequence ?? null
  }, symbol)
}
