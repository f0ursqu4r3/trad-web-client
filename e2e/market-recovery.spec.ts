import type { WebSocketRoute } from '@playwright/test'
import { expect, test } from './support/test'
import { BROWSER_PROTOCOL_VERSION } from '../src/lib/gateway/wire'
import {
  ENGINE_SUBSCRIPTION_ID,
  engineProjectionSnapshot,
} from '../src/views/e2e/engineProjectionFixtureData'

for (const cachedIdle of [false, true]) {
  test(`${cachedIdle ? 'cached idle' : 'cold'} feed recovers live P&L on the same wire subscription`, async ({
    page,
  }) => {
    await page.clock.install()
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
        json: {
          authenticated: true,
          user: { sub: 'test', email: 'market-recovery@trad.local' },
        },
      }),
    )
    await page.route('**/auth/ws-ticket', (route) =>
      route.fulfill({ json: { token: 'fixture-ticket', expires_in: 60 } }),
    )
    await page.route('https://api.hyperliquid.xyz/info', (route) =>
      route.fulfill({
        json: {
          universe: [
            { name: 'BTC', szDecimals: 5 },
            { name: 'ETH', szDecimals: 4 },
            { name: 'SOL', szDecimals: 2 },
          ],
        },
      }),
    )
    const streams = new Map<string, { ws: WebSocketRoute; subscription: string; account: string }>()
    const subscribeCounts = new Map<string, number>()
    const sample = (sequence: number, price = '2100') => ({
      sequence,
      update_id: `market-${sequence}`,
      generation: 1,
      received_at_ms: Date.now(),
      exchange_time_ms: Date.now(),
      price,
      trade_id: `trade-${sequence}`,
    })
    await page.routeWebSocket('**/ws', (ws) => {
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
              route: {
                exchange: 'hyperliquid',
                network: 'testnet',
                account_id: message.account_id,
              },
              cause: { kind: 'initial' },
              snapshot: engineProjectionSnapshot(),
            }),
          )
        } else if (message.kind === 'subscribe_market') {
          const subscription = `10000000-0000-4000-8000-${String(streams.size + 10).padStart(12, '0')}`
          subscribeCounts.set(message.symbol, (subscribeCounts.get(message.symbol) ?? 0) + 1)
          streams.set(message.symbol, { ws, subscription, account: message.account_id })
          ws.send(
            JSON.stringify({
              kind: 'market_window',
              request_id: message.request_id,
              subscription_id: subscription,
              account_id: message.account_id,
              window: {
                symbol: message.symbol,
                unavailable_reason: cachedIdle ? 'cached idle feed' : null,
                oldest_sequence: cachedIdle ? 1 : null,
                next_sequence: cachedIdle ? 2 : 1,
                samples: cachedIdle ? [sample(1)] : [],
              },
            }),
          )
          ws.send(
            JSON.stringify({
              kind: 'market_feed_unavailable',
              subscription_id: subscription,
              account_id: message.account_id,
              symbol: message.symbol,
              reason: 'awaiting first exchange price',
            }),
          )
        } else if (message.kind === 'ping')
          ws.send(JSON.stringify({ kind: 'pong', nonce: message.nonce }))
      })
    })
    await page.goto('/e2e/trader-workspace?market_wire=1')
    await expect.poll(() => streams.has('ETH')).toBe(true)
    const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
    await expect(eth.locator('.metric-pnl')).toContainText(
      cachedIdle ? 'feed reconnecting' : 'waiting for price',
    )
    await expect(eth.locator('.metric-pnl')).not.toContainText('Gross open')
    await page.clock.runFor(35_000)
    expect(subscribeCounts.get('ETH')).toBe(1)
    const stream = streams.get('ETH')!
    const send = (kind: string, fields: Record<string, unknown>) =>
      stream.ws.send(
        JSON.stringify({
          kind,
          subscription_id: stream.subscription,
          account_id: stream.account,
          symbol: 'ETH',
          ...fields,
        }),
      )
    send('market_samples', { samples: [sample(2)] })
    await expect(eth.locator('.metric-pnl')).toContainText('Gross open')
    await expect(eth.locator('.metric-pnl')).not.toContainText('feed reconnecting')
    // Wrong-scope health cannot invalidate this live trade.
    send('market_feed_unavailable', {
      account_id: '99999999-0000-4000-8000-000000000001',
      reason: 'other account',
    })
    await expect(eth.locator('.metric-pnl')).toContainText('Gross open')
    send('market_feed_unavailable', { reason: 'exchange disconnected' })
    await expect(eth.locator('.metric-pnl')).toContainText('feed reconnecting')
    await expect(eth.locator('.metric-pnl')).not.toContainText('Gross open')
    send('market_samples', { samples: [] })
    await expect(eth.locator('.metric-pnl')).toContainText('feed reconnecting')
    await page.clock.runFor(35_000)
    expect(subscribeCounts.get('ETH')).toBe(1)
    send('market_samples', { samples: [sample(5, '2101')] })
    await expect(eth.locator('.metric-pnl')).toContainText('Gross open')
    expect(subscribeCounts.get('ETH')).toBe(1)
    send('market_error', { request_id: null, error: { kind: 'unauthorized' } })
    await expect(eth.locator('.metric-pnl')).toContainText('feed unavailable')
    await page.clock.runFor(35_000)
    expect(subscribeCounts.get('ETH')).toBe(1)
  })
}
