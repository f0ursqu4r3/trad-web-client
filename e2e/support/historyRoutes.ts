import type { Page, Request, Route } from '@playwright/test'

// The S3 history routes (GET /api/accounts/{id}/...), played here: closed
// trade pages, one trade's fills and evidence, a coin's exposures. Each
// route records what the page asked and can be told to refuse.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

export interface HistoryCall {
  url: URL
  ifNoneMatch: string | null
  // A cell user's history pass (bearer); null with the session cookie.
  authorization: string | null
}

export interface HistoryRoutes {
  trades: HistoryCall[]
  fills: HistoryCall[]
  evidence: HistoryCall[]
  exposures: HistoryCall[]
  // Answers the next N calls of a route with 429 and this Retry-After.
  rateLimit: (
    route: 'trades' | 'fills' | 'evidence' | 'exposures',
    times: number,
    seconds: number,
  ) => void
}

export const CLOSED_TRADE_COUNT = 120
const PAGE = 50

export function closedSummary(index: number, revision = 1): Json {
  const id = `52000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  const symbol = ['BTC', 'ETH', 'SOL', 'ZEC'][index % 4]!
  const createdAt = Date.UTC(2026, 9, 20, 12) - index * 3_600_000
  const loss = index % 3 === 0
  return {
    trade_id: id,
    revision,
    primary_command_id: `53000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    primary_kind: 'place_order',
    entry_label: 'Market',
    symbol,
    side: index % 2 === 0 ? 'long' : 'short',
    created_at: createdAt,
    closed_at: createdAt + 600_000,
    lifecycle: index === 7 ? 'taken_over' : 'closed',
    coin_block_applies: false,
    attention_reason: null,
    position_state: 'closed',
    awaiting_exchange_confirmation: false,
    requested_quantity: '1',
    filled_quantity: '1',
    opened_quantity: '1',
    reduced_quantity: '1',
    remaining_quantity: '0',
    average_entry_price: '100',
    pnl_asset: 'USDC',
    pnl_evidence_complete: index !== 7,
    realized_pnl: [],
    venue_realized_pnl: [],
    net_after_fees: [{ asset: 'USDC', amount: loss ? `-${index}.25` : `${index}.5` }],
    total_fees: [],
    builder_fees: [],
    fees_by_leg: null,
    planned_risk: null,
    initial_planned_loss: null,
    current_stop_exposure: null,
    chase_price_risk: null,
    pinned_all_in_target_tenths_bps: null,
    pinned_fee_source: null,
    pinned_fee_policy_version: null,
    protection: null,
    fill_count: 3,
    command_count: 1,
  }
}

export function execution(eventId: string, quantity: string, price: string, at: number): Json {
  return {
    event_id: eventId,
    fill: {
      event_id: eventId,
      execution_id: null,
      symbol: 'BTC',
      client_order_id: null,
      remote_order_id: null,
      side: 'buy',
      position_side: 'long',
      price,
      quantity,
      occurred_at: at,
      is_maker: false,
      fee: null,
      builder_fee: null,
      realized_pnl: null,
      start_position: null,
      transaction_hash: null,
    },
    order: null,
    reconciliation_required: false,
  }
}

function closedPage(before: string | null): Json {
  const start = before === null ? 0 : Number(before.replace('p', ''))
  const trades = []
  for (let index = start; index < Math.min(start + PAGE, CLOSED_TRADE_COUNT); index += 1) {
    trades.push(closedSummary(index))
  }
  // The second page repeats the first page's last trade at a newer revision.
  if (start === PAGE) trades.unshift(closedSummary(PAGE - 1, 9))
  const next = start + PAGE < CLOSED_TRADE_COUNT ? `p${start + PAGE}` : null
  return { trades, next }
}

function fillsPage(tradeId: string, after: string | null): Json {
  const at = Date.UTC(2026, 9, 20, 12)
  if (after === null) {
    return {
      trade_id: tradeId,
      fills: [
        { role: 'entry', execution: execution('fill-entry', '1', '100', at) },
        { role: 'close', execution: execution('fill-close', '0.6', '104', at + 60_000) },
      ],
      next: 'f2',
    }
  }
  return {
    trade_id: tradeId,
    fills: [{ role: 'manual', execution: execution('fill-manual', '0.4', '103', at + 120_000) }],
    next: null,
  }
}

function evidencePage(tradeId: string, cursor: string | null): Json {
  const command = (id: string, at: number) => ({
    command_id: id,
    accepted_at: at,
    accepted: { kind: 'place_order', parameters: {} },
    lifecycle: 'succeeded',
    operation_ids: [],
    failure_reason: null,
  })
  return {
    trade_id: tradeId,
    commands: cursor === null ? [command('cmd-first', 1_000)] : [command('cmd-second', 2_000)],
    orders: [],
    protections: [],
    execution_groups: [],
    chases: [],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    protection_amendments: [],
    native_protection: null,
    relationships: [],
    next: cursor === null ? 'e2' : null,
  }
}

function exposuresPage(symbol: string, before: string | null): Json {
  const row = (index: number) => ({
    created_at: Date.UTC(2026, 9, 1) - index * 86_400_000,
    exposure: {
      scope_id: `54000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      side: 'long',
      opened_quantity: '0.5',
      reduced_quantity: '0.5',
      remaining_quantity: '0',
    },
  })
  return before === null
    ? { symbol, total: 4, exposures: [row(1), row(2)], next: 'x2' }
    : { symbol, total: 4, exposures: [row(3)], next: null }
}

export async function routeHistory(page: Page): Promise<HistoryRoutes> {
  const limited: Record<string, Array<number>> = {
    trades: [],
    fills: [],
    evidence: [],
    exposures: [],
  }
  const routes: HistoryRoutes = {
    trades: [],
    fills: [],
    evidence: [],
    exposures: [],
    rateLimit(route, times, seconds) {
      for (let count = 0; count < times; count += 1) limited[route]!.push(seconds)
    },
  }
  const serve = (name: keyof typeof limited, body: (url: URL) => Json) => {
    return async (route: Route, request: Request) => {
      const url = new URL(request.url())
      const calls = routes[name as 'trades']
      calls.push({
        url,
        ifNoneMatch: request.headers()['if-none-match'] ?? null,
        authorization: request.headers()['authorization'] ?? null,
      })
      const seconds = limited[name]!.shift()
      if (seconds !== undefined) {
        await route.fulfill({
          status: 429,
          headers: { 'Retry-After': String(seconds) },
          json: { error: 'too many history requests', code: 'rate_limited' },
        })
        return
      }
      const json = body(url)
      const etag = `W/"${Buffer.from(JSON.stringify(json)).toString('base64').slice(0, 24)}"`
      if (request.headers()['if-none-match'] === etag) {
        await route.fulfill({ status: 304, headers: { ETag: etag } })
        return
      }
      await route.fulfill({ json, headers: { ETag: etag, 'Cache-Control': 'private, no-cache' } })
    }
  }
  await page.route(
    /\/api\/accounts\/[^/]+\/trades(\?|$)/,
    serve('trades', (url) => closedPage(url.searchParams.get('before'))),
  )
  await page.route(
    /\/api\/accounts\/[^/]+\/trades\/[^/]+\/fills/,
    serve('fills', (url) =>
      fillsPage(url.pathname.split('/').at(-2)!, url.searchParams.get('after')),
    ),
  )
  await page.route(
    /\/api\/accounts\/[^/]+\/trades\/[^/]+\/evidence/,
    serve('evidence', (url) =>
      evidencePage(url.pathname.split('/').at(-2)!, url.searchParams.get('cursor')),
    ),
  )
  await page.route(
    /\/api\/accounts\/[^/]+\/positions\/[^/]+\/exposures/,
    serve('exposures', (url) =>
      exposuresPage(
        decodeURIComponent(url.pathname.split('/').at(-2)!),
        url.searchParams.get('before'),
      ),
    ),
  )
  return routes
}
