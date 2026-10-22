import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { BROWSER_PROTOCOL_VERSION } from '../src/lib/gateway/wire'
import {
  ENGINE_SUBSCRIPTION_ID,
  engineProjectionSnapshot,
} from '../src/views/e2e/engineProjectionFixtureData'

// Hyperliquid drops the whole shared price connection when asked for a coin
// that does not exist, so typing a ticker must never send partial symbols.

interface MarketWire {
  subscribes: string[]
  unsubscribes: string[]
}

type MarketErrorReply = Record<string, unknown> | null

async function openWorkspace(
  page: Page,
  options: { catalog: boolean; marketError?: (symbol: string) => MarketErrorReply },
): Promise<MarketWire> {
  await page.route('**/api/accounts', (route) =>
    route.fulfill({
      json: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          label: 'Krio demo',
          key: 'fixture',
          exchange: 'hyperliquid',
          network: 'mainnet',
          exchange_metadata: {
            agent_approved: true,
            builder_approved: true,
            product: 'usdc_perp',
            margin_mode: 'cross',
            user_address: '0x7d6cabebf3ab638ee10e0eaabe671bfcfb8336dc3',
            default_leverage: 1,
          },
        },
      ],
    }),
  )
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      json: { authenticated: true, user: { sub: 'test', email: 'typing@trad.local' } },
    }),
  )
  await page.route('**/auth/ws-ticket', (route) =>
    route.fulfill({ json: { token: 'fixture-ticket', expires_in: 60 } }),
  )
  await page.route('https://api.hyperliquid.xyz/info', async (route) => {
    const request = route.request().postDataJSON() as { type?: string }
    if (request.type === 'activeAssetData') {
      await route.fulfill({
        json: {
          leverage: { type: 'cross', value: 1 },
          availableToTrade: ['100000', '100000'],
          maxTradeSzs: ['10', '10'],
        },
      })
      return
    }
    if (!options.catalog) {
      await route.fulfill({ status: 503, body: 'catalog down' })
      return
    }
    await route.fulfill({
      json: {
        universe: [
          { name: 'BTC', szDecimals: 5 },
          { name: 'ETH', szDecimals: 4 },
          { name: 'SOL', szDecimals: 2 },
          { name: 'ZEC', szDecimals: 2 },
        ],
      },
    })
  })

  const wire: MarketWire = { subscribes: [], unsubscribes: [] }
  const subscriptionSymbols = new Map<string, string>()
  await page.routeWebSocket('**/ws', (ws: WebSocketRoute) => {
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw))
      if (message.kind === 'authenticate') {
        ws.send(
          JSON.stringify({
            kind: 'hello',
            protocol_version: BROWSER_PROTOCOL_VERSION,
            session_valid_for_ms: 3_600_000,
          }),
        )
      } else if (message.kind === 'subscribe_account') {
        ws.send(
          JSON.stringify({
            kind: 'account_snapshot',
            request_id: message.request_id,
            subscription_id: ENGINE_SUBSCRIPTION_ID,
            route: { exchange: 'hyperliquid', network: 'testnet', account_id: message.account_id },
            cause: { kind: 'initial' },
            snapshot: engineProjectionSnapshot(),
          }),
        )
      } else if (message.kind === 'subscribe_market') {
        wire.subscribes.push(message.symbol)
        const error = options.marketError?.(message.symbol) ?? null
        if (error !== null) {
          ws.send(
            JSON.stringify({
              kind: 'market_error',
              request_id: message.request_id,
              subscription_id: null,
              account_id: message.account_id,
              error,
            }),
          )
          return
        }
        const subscription = `10000000-0000-4000-8000-${String(subscriptionSymbols.size + 10).padStart(12, '0')}`
        subscriptionSymbols.set(subscription, message.symbol)
        ws.send(
          JSON.stringify({
            kind: 'market_window',
            request_id: message.request_id,
            subscription_id: subscription,
            account_id: message.account_id,
            window: {
              symbol: message.symbol,
              unavailable_reason: null,
              oldest_sequence: 1,
              next_sequence: 2,
              samples: [
                {
                  sequence: 1,
                  update_id: `market-${subscription}`,
                  generation: 1,
                  received_at_ms: Date.now(),
                  exchange_time_ms: Date.now(),
                  price: message.symbol === 'ZEC' ? '41.25' : '2100',
                  trade_id: `trade-${subscription}`,
                },
              ],
            },
          }),
        )
      } else if (message.kind === 'unsubscribe_market') {
        wire.unsubscribes.push(subscriptionSymbols.get(message.subscription_id) ?? '?')
      } else if (message.kind === 'ping') {
        ws.send(JSON.stringify({ kind: 'pong', nonce: message.nonce }))
      }
    })
  })
  await page.goto('/e2e/trader-workspace?market_wire=1')
  return wire
}

function ticketParts(page: Page) {
  const ticket = page.getByRole('form', { name: 'New trade order ticket' })
  return {
    market: ticket.getByRole('combobox', { name: /market/i }).first(),
    price: ticket.locator('.market-price').first(),
  }
}

test('typing a ticker sends one subscription for the finished symbol only', async ({ page }) => {
  const wire = await openWorkspace(page, { catalog: true })
  const { market, price } = ticketParts(page)
  await expect.poll(() => [...wire.subscribes].sort()).toEqual(['BTC', 'ETH', 'SOL'])
  await expect(price).toContainText('2,100')
  const before = wire.subscribes.length

  await market.selectText()
  await market.pressSequentially('ZEC', { delay: 60 })
  await expect(market).toHaveValue('ZEC')
  await expect(price).toContainText('41.25')
  // Give any stray debounce or retry time to fire.
  await page.waitForTimeout(1_000)

  expect(wire.subscribes.slice(before)).toEqual(['ZEC'])
  // The trade cards keep BTC, ETH and SOL: the ticket only released its own
  // BTC demand, so nothing else was unsubscribed or resubscribed.
  expect(wire.unsubscribes).toEqual([])
  expect(wire.subscribes.filter((symbol) => symbol !== 'ZEC').sort()).toEqual(['BTC', 'ETH', 'SOL'])
})

test('an unlisted ticker shows Unknown market and is never subscribed', async ({ page }) => {
  const wire = await openWorkspace(page, { catalog: true })
  const { market, price } = ticketParts(page)
  await expect.poll(() => wire.subscribes.length).toBe(3)

  await market.selectText()
  await market.pressSequentially('ZZZ', { delay: 30 })
  await expect(price).toHaveText('Unknown market')
  await page.waitForTimeout(1_000)
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
      // Without a catalog the gateway is the judge of the typed symbol.
      catalog: false,
      marketError: (symbol) => (symbol === 'ZE' ? error : null),
    })
    const { market, price } = ticketParts(page)
    await expect.poll(() => wire.subscribes.length).toBe(3)

    await market.selectText()
    await market.pressSequentially('ZE')
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
  await page.clock.runFor(400)
  await expect.poll(() => wire.subscribes.slice(3)).toEqual(['ZE'])
  await market.press('End')
  await market.pressSequentially('C')
  await page.clock.runFor(400)
  await expect(price).toContainText('41.25')
  await page.clock.runFor(120_000)

  expect(wire.subscribes.slice(3)).toEqual(['ZE', 'ZEC'])
  expect(wire.unsubscribes).toEqual([])
})
