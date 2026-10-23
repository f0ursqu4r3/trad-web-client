import type { Page, WebSocketRoute } from '@playwright/test'
import { BROWSER_PROTOCOL_VERSION } from '../../src/lib/gateway/wire'
import {
  ENGINE_SUBSCRIPTION_ID,
  engineProjectionSnapshot,
} from '../../src/views/e2e/engineProjectionFixtureData'

// A trader workspace on a scripted gateway socket: the real gateway store,
// market store and projection store, with the server side played here.

export const WORKSPACE_ACCOUNT_ID = '10000000-0000-4000-8000-000000000001'

// Fixture JSON edited by path; the wire types are checked by the app itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>
export type MarketErrorReply = Record<string, unknown> | null

export interface HeldMarketRequest {
  requestId: string
  accountId: string
  symbol: string
}

export interface WorkspaceWire {
  subscribes: string[]
  unsubscribes: string[]
  accountSubscribes: number
  accountFetches: number
  // Client messages in arrival order: `kind` or `kind:SYMBOL` for markets.
  clientLog: string[]
  // Subscribes left unanswered by `holdMarket`, answerable later.
  heldMarkets: HeldMarketRequest[]
  answerMarket: (held: HeldMarketRequest) => void
  // Account snapshots wait from holdSnapshots() until releaseSnapshots().
  holdSnapshots: () => void
  releaseSnapshots: () => void
  // Closes the page's socket from the server side.
  dropSocket: () => Promise<void>
  // Live market subscriptions by symbol.
  markets: Map<string, { subscriptionId: string; sequence: number; price: number }>
  socket: () => WebSocketRoute | null
  sendSamples: (symbol: string, count?: number) => boolean
  sendDelta: () => void
}

export interface WorkspaceOptions {
  catalog?: boolean
  marketError?: (symbol: string) => MarketErrorReply
  // Six trade cards over BTC, ETH and ZEC instead of three.
  busy?: boolean
  path?: string
  // Rows for Trad's catalog (`GET /api/markets/hyperliquid/...`); without
  // them that endpoint fails and the app falls back to Hyperliquid's meta.
  catalogRows?: unknown[]
  // Edits the account snapshot before it is sent.
  editSnapshot?: (snapshot: Json) => void
  // Leaves this subscribe unanswered (attempt counts from 1 per symbol).
  holdMarket?: (symbol: string, attempt: number) => boolean
}

const START_PRICES: Record<string, number> = { BTC: 64_000, ETH: 2_100, ZEC: 41.25, SOL: 144 }

export async function openWorkspace(
  page: Page,
  options: WorkspaceOptions = {},
): Promise<WorkspaceWire> {
  const catalog = options.catalog ?? true
  const snapshot: Json = options.busy ? busySnapshot() : engineProjectionSnapshot()
  options.editSnapshot?.(snapshot)
  let revision = snapshot.checkpoint.projection_revision
  let socket: WebSocketRoute | null = null
  let accountSubscription: string | null = null
  let tick = 0
  let snapshotGate: Promise<void> = Promise.resolve()
  let openSnapshotGate = () => {}
  const marketAttempts = new Map<string, number>()
  const subscriptionSymbols = new Map<string, string>()

  function sendMarketWindow(ws: WebSocketRoute, held: HeldMarketRequest): void {
    const subscription = `10000000-0000-4000-8000-${String(subscriptionSymbols.size + 10).padStart(12, '0')}`
    subscriptionSymbols.set(subscription, held.symbol)
    const price = START_PRICES[held.symbol] ?? 100
    wire.markets.set(held.symbol, { subscriptionId: subscription, sequence: 1, price })
    ws.send(
      JSON.stringify({
        kind: 'market_window',
        request_id: held.requestId,
        subscription_id: subscription,
        account_id: held.accountId,
        window: {
          symbol: held.symbol,
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
              price: held.symbol === 'ZEC' ? '41.25' : '2100',
              trade_id: `trade-${subscription}`,
            },
          ],
        },
      }),
    )
  }

  const wire: WorkspaceWire = {
    subscribes: [],
    unsubscribes: [],
    accountSubscribes: 0,
    accountFetches: 0,
    clientLog: [],
    heldMarkets: [],
    answerMarket(held) {
      if (socket !== null) sendMarketWindow(socket, held)
    },
    holdSnapshots() {
      snapshotGate = new Promise((resolve) => (openSnapshotGate = resolve))
    },
    releaseSnapshots() {
      openSnapshotGate()
    },
    async dropSocket() {
      await socket?.close({ code: 1011, reason: 'test drop' })
    },
    markets: new Map(),
    socket: () => socket,
    sendSamples(symbol, count = 1) {
      const market = wire.markets.get(symbol)
      if (market === undefined || socket === null) return false
      const now = Date.now()
      const samples = Array.from({ length: count }, () => {
        market.sequence += 1
        market.price *= 1 + (Math.random() - 0.5) * 0.0004
        return {
          sequence: market.sequence,
          update_id: `market-${symbol}-${market.sequence}`,
          generation: market.sequence,
          received_at_ms: now,
          exchange_time_ms: now,
          price: market.price.toFixed(symbol === 'ZEC' ? 3 : 2),
          trade_id: `trade-${symbol}-${market.sequence}`,
        }
      })
      socket.send(
        JSON.stringify({
          kind: 'market_samples',
          subscription_id: market.subscriptionId,
          account_id: WORKSPACE_ACCOUNT_ID,
          symbol,
          samples,
        }),
      )
      return true
    },
    sendDelta() {
      if (socket === null || accountSubscription === null) return
      revision += 1
      tick += 1
      socket.send(
        JSON.stringify({
          kind: 'account_delta',
          subscription_id: accountSubscription,
          route: { exchange: 'hyperliquid', network: 'testnet', account_id: WORKSPACE_ACCOUNT_ID },
          delta: liveDelta(snapshot, revision, tick),
        }),
      )
    },
  }

  await page.route('**/api/accounts', (route) => {
    wire.accountFetches += 1
    return route.fulfill({
      json: [
        {
          id: WORKSPACE_ACCOUNT_ID,
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
    })
  })
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      json: { authenticated: true, user: { sub: 'test', email: 'workspace@trad.local' } },
    }),
  )
  await page.route('**/auth/session/refresh', (route) =>
    route.fulfill({
      json: { authenticated: true, user: { sub: 'test', email: 'workspace@trad.local' } },
    }),
  )
  await page.route('**/auth/ws-ticket', (route) =>
    route.fulfill({ json: { token: 'fixture-ticket', expires_in: 60 } }),
  )
  await page.route('**/api/telemetry**', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/api/markets/**', (route) =>
    options.catalogRows === undefined
      ? route.fulfill({ status: 503, json: { error: 'no node returned the instrument catalog' } })
      : route.fulfill({
          json: {
            exchange: 'hyperliquid',
            network: 'mainnet',
            observed_at: Date.now(),
            instruments: options.catalogRows,
          },
        }),
  )
  await page.route('https://api.hyperliquid.xyz/info', async (route) => {
    const request = route.request().postDataJSON() as { type?: string }
    if (request.type === 'userFees') {
      // Tier 1: taker 4.0 bps, maker 1.2 bps.
      await route.fulfill({ json: { userCrossRate: '0.0004', userAddRate: '0.00012' } })
      return
    }
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
    if (!catalog) {
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

  await page.routeWebSocket('**/ws', (ws: WebSocketRoute) => {
    socket = ws
    ws.onMessage(async (raw) => {
      const message = JSON.parse(String(raw))
      wire.clientLog.push(message.symbol ? `${message.kind}:${message.symbol}` : message.kind)
      if (message.kind === 'authenticate') {
        ws.send(
          JSON.stringify({
            kind: 'hello',
            protocol_version: BROWSER_PROTOCOL_VERSION,
            session_valid_for_ms: 3_600_000,
          }),
        )
      } else if (message.kind === 'subscribe_account') {
        wire.accountSubscribes += 1
        await snapshotGate
        accountSubscription = ENGINE_SUBSCRIPTION_ID
        revision = snapshot.checkpoint.projection_revision
        ws.send(
          JSON.stringify({
            kind: 'account_snapshot',
            request_id: message.request_id,
            subscription_id: ENGINE_SUBSCRIPTION_ID,
            route: { exchange: 'hyperliquid', network: 'testnet', account_id: message.account_id },
            cause: { kind: 'initial' },
            snapshot,
          }),
        )
      } else if (message.kind === 'subscribe_market') {
        wire.subscribes.push(message.symbol)
        const attempt = (marketAttempts.get(message.symbol) ?? 0) + 1
        marketAttempts.set(message.symbol, attempt)
        const held: HeldMarketRequest = {
          requestId: message.request_id,
          accountId: message.account_id,
          symbol: message.symbol,
        }
        if (options.holdMarket?.(message.symbol, attempt)) {
          wire.heldMarkets.push(held)
          return
        }
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
        sendMarketWindow(ws, held)
      } else if (message.kind === 'unsubscribe_market') {
        const symbol = subscriptionSymbols.get(message.subscription_id) ?? '?'
        wire.unsubscribes.push(symbol)
        if (wire.markets.get(symbol)?.subscriptionId === message.subscription_id) {
          wire.markets.delete(symbol)
        }
      } else if (message.kind === 'ping') {
        ws.send(JSON.stringify({ kind: 'pong', nonce: message.nonce }))
      }
    })
  })
  await page.goto(options.path ?? '/e2e/trader-workspace?market_wire=1')
  return wire
}

// Replaces document visibility with a switch the test controls, and holds
// animation frames while "hidden" the way a background tab does.
export async function installVisibilitySwitch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let hidden = false
    const held: Array<() => void> = []
    const nativeFrame = window.requestAnimationFrame.bind(window)
    Object.defineProperty(Document.prototype, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    })
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      if (!hidden) return nativeFrame(callback)
      held.push(() => nativeFrame(callback))
      return -1
    }
    ;(window as unknown as { __setTabHidden: (next: boolean) => void }).__setTabHidden = (
      next: boolean,
    ) => {
      hidden = next
      if (next) {
        window.dispatchEvent(new Event('blur'))
        document.dispatchEvent(new Event('visibilitychange'))
        return
      }
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      for (const release of held.splice(0)) release()
    }
  })
}

export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(
    (next) =>
      (window as unknown as { __setTabHidden: (next: boolean) => void }).__setTabHidden(next),
    hidden,
  )
}

// Three more trades on a copy of the fixture account: BTC, ETH and ZEC each
// carry two cards.
function busySnapshot(): Json {
  const base = JSON.parse(JSON.stringify(engineProjectionSnapshot()).replaceAll('"SOL"', '"ZEC"'))
  const copy = JSON.parse(
    JSON.stringify(engineProjectionSnapshot())
      .replace(/"([2-9]\d{7}-0000-4000-8000-)0/g, '"$11')
      .replaceAll('scope-', 'scope-b-')
      .replaceAll('"BTC"', '"@ETH"')
      .replaceAll('"ETH"', '"@ZEC"')
      .replaceAll('"SOL"', '"@BTC"')
      .replaceAll('"@', '"'),
  )
  for (const key of [
    'commands',
    'execution_groups',
    'chases',
    'trailing_entries',
    'close_workflows',
    'flatten_workflows',
    'entry_cancellations',
    'account_controls',
    'protection_amendments',
    'native_protections',
    'orders',
    'executions',
    'relationships',
  ]) {
    base[key] = [...base[key], ...copy[key]]
  }
  for (const position of copy.positions) {
    const existing = base.positions.find((row: Json) => row.symbol === position.symbol)
    if (existing === undefined) base.positions.push(position)
    else existing.owned_exposure = { ...existing.owned_exposure, ...position.owned_exposure }
  }
  const summary = base.checkpoint.summary
  for (const key of Object.keys(summary)) {
    if (Array.isArray(base[key]) && typeof summary[key] === 'number') {
      summary[key] = base[key].length
    }
    if (key.startsWith('active_') && typeof summary[key] === 'number') summary[key] *= 2
  }
  base.window.total_commands = base.commands.length + 1
  base.window.included_commands = base.commands.length
  return base
}

// What the engine streams while trades work: chase quotes, trailing-entry
// tracking and the settlement balance.
function liveDelta(snapshot: Json, revision: number, tick: number): Json {
  const drift = Math.sin(tick / 7)
  return {
    checkpoint: { ...snapshot.checkpoint, projection_revision: revision },
    commands: [],
    execution_groups: [],
    chases: snapshot.chases.map((chase: Json) => ({
      ...chase,
      latest_bid: (Number(chase.latest_bid) + drift).toFixed(3),
      latest_ask: (Number(chase.latest_ask) + drift).toFixed(3),
      market_generation: chase.market_generation + tick,
    })),
    trailing_entries: snapshot.trailing_entries.map((entry: Json) => ({
      ...entry,
      market_generation: entry.market_generation + tick,
      latest_trade: {
        ...entry.latest_trade,
        generation: entry.latest_trade.generation + tick,
        price: (Number(entry.latest_trade.price) + drift * 0.1).toFixed(3),
      },
    })),
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    orders: [],
    executions: [],
    relationships: [],
    native_protections: [],
    positions: [],
    balances: snapshot.balances.map((balance: Json) => ({
      ...balance,
      available: (Number(balance.available) + drift).toFixed(6),
    })),
    protections: [],
  }
}
