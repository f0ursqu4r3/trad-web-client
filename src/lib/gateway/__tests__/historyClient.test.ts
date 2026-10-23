import assert from 'node:assert/strict'
import test from 'node:test'

import {
  forgivingHistoryCache,
  indexedDbHistoryCache,
  memoryHistoryCache,
  noHistoryCache,
  type HistoryPageCache,
} from '../historyCache.ts'
import { HistoryClient, HistoryRequestError, retryAfterMs } from '../historyClient.ts'
import { HistoryPager, newerSummary } from '../historyPager.ts'
import type { TradeSummary } from '../tradeSummary.ts'

const ACCOUNT = '10000000-0000-4000-8000-000000000001'
const TRADE = '51000000-0000-4000-8000-000000000001'

interface Sent {
  url: URL
  init: RequestInit
}

type Reply = { status: number; body?: unknown; headers?: Record<string, string> }

// A gateway that answers from a script and records what was asked.
function gateway(replies: Array<Reply | ((sent: Sent) => Reply)>) {
  const sent: Sent[] = []
  const fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: new URL(String(input), 'http://trad.local'), init }
    sent.push(call)
    const next = replies.shift()
    if (next === undefined) throw new Error(`unexpected request ${call.url}`)
    const reply = typeof next === 'function' ? next(call) : next
    const body = reply.body === undefined ? null : JSON.stringify(reply.body)
    return new Response(reply.status === 304 ? null : body, {
      status: reply.status,
      headers: reply.headers,
    })
  }) as typeof fetch
  return { fetch, sent }
}

function header(sent: Sent, name: string): string | null {
  return new Headers(sent.init.headers).get(name)
}

function summary(id: number, revision = 1): TradeSummary {
  return {
    trade_id: `trade-${id}`,
    revision,
    symbol: 'BTC',
    created_at: 1_000_000 - id,
  } as TradeSummary
}

function client(fetch: typeof globalThis.fetch, cache: HistoryPageCache = memoryHistoryCache()) {
  const waits: number[] = []
  let now = 1_000
  const history = new HistoryClient({
    baseUrl: '/api',
    fetch,
    cache,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms)
      now += ms
    },
  })
  return { history, waits }
}

test('closed trades page with credentials, limit and the previous cursor', async () => {
  const { fetch, sent } = gateway([
    {
      status: 200,
      body: { trades: [summary(1), summary(2)], next: 'c2' },
      headers: { ETag: 'W/"a"' },
    },
    { status: 200, body: { trades: [summary(3)], next: null } },
  ])
  const { history } = client(fetch)
  const first = await history.closedTrades(ACCOUNT, null)
  assert.deepEqual(
    first.trades.map((row) => row.trade_id),
    ['trade-1', 'trade-2'],
  )
  assert.equal(first.next, 'c2')
  const second = await history.closedTrades(ACCOUNT, 'c2', { limit: 20 })
  assert.equal(second.next, null)

  assert.equal(sent[0]!.url.pathname, `/api/accounts/${ACCOUNT}/trades`)
  assert.equal(sent[0]!.url.searchParams.get('state'), 'closed')
  assert.equal(sent[0]!.url.searchParams.get('limit'), '50')
  assert.equal(sent[0]!.url.searchParams.has('before'), false)
  assert.equal(sent[0]!.init.credentials, 'include')
  assert.equal(sent[0]!.init.cache, 'no-store')
  assert.equal(sent[1]!.url.searchParams.get('before'), 'c2')
  assert.equal(sent[1]!.url.searchParams.get('limit'), '20')
})

test('the other three routes: paths, cursors and percent-encoded coins', async () => {
  const fill = { event_id: 'e1', fill: { quantity: '1', price: '2' }, order: null }
  const { fetch, sent } = gateway([
    {
      status: 200,
      body: {
        trade_id: TRADE,
        fills: [
          { role: 'entry', execution: fill },
          { role: 'manual', execution: { ...fill, event_id: 'e2' } },
          { role: 'mystery', execution: fill },
          { role: 'close', execution: { event_id: 'no-fill' } },
        ],
        next: 'f2',
      },
    },
    {
      status: 200,
      body: { trade_id: TRADE, commands: [{ command_id: 'c1' }, { nope: 1 }], next: null },
    },
    {
      status: 200,
      body: {
        symbol: 'xyz:GOLD',
        total: 3,
        exposures: [
          { created_at: 5, exposure: { scope_id: 's1' } },
          { exposure: { scope_id: 's2' } },
        ],
        next: null,
      },
    },
  ])
  const { history } = client(fetch)
  const fills = await history.tradeFills(ACCOUNT, TRADE, 'f1')
  assert.deepEqual(
    fills.fills.map((row) => [row.role, row.execution.event_id]),
    [
      ['entry', 'e1'],
      ['manual', 'e2'],
    ],
  )
  const evidence = await history.tradeEvidence(ACCOUNT, TRADE, 'ev1')
  assert.deepEqual(
    evidence.commands.map((row) => row.command_id),
    ['c1'],
  )
  assert.deepEqual(evidence.orders, [])
  assert.equal(evidence.native_protection, null)
  const exposures = await history.exposures(ACCOUNT, 'xyz:GOLD', null)
  assert.equal(exposures.total, 3)
  assert.deepEqual(
    exposures.exposures.map((row) => row.created_at),
    [5, null],
  )

  assert.equal(sent[0]!.url.pathname, `/api/accounts/${ACCOUNT}/trades/${TRADE}/fills`)
  assert.equal(sent[0]!.url.searchParams.get('after'), 'f1')
  assert.equal(sent[0]!.url.searchParams.get('limit'), '250')
  assert.equal(sent[1]!.url.pathname, `/api/accounts/${ACCOUNT}/trades/${TRADE}/evidence`)
  assert.equal(sent[1]!.url.searchParams.get('cursor'), 'ev1')
  assert.ok(sent[2]!.url.href.includes('/positions/xyz%3AGOLD/exposures'))
  assert.equal(sent[2]!.url.searchParams.get('limit'), '200')
})

test('a cached page is revalidated with If-None-Match and a 304 serves it', async () => {
  const cache = memoryHistoryCache()
  const { fetch, sent } = gateway([
    { status: 200, body: { trades: [summary(1)], next: null }, headers: { ETag: 'W/"one"' } },
    { status: 304, headers: { ETag: 'W/"one"' } },
    { status: 200, body: { trades: [summary(1, 2)], next: null }, headers: { ETag: 'W/"two"' } },
    { status: 200, body: { trades: [summary(9)], next: null } },
  ])
  const { history } = client(fetch, cache)
  await history.closedTrades(ACCOUNT, null)
  assert.equal(header(sent[0]!, 'If-None-Match'), null)
  await new Promise((resolve) => setTimeout(resolve, 0))

  const again = await history.closedTrades(ACCOUNT, null)
  assert.equal(header(sent[1]!, 'If-None-Match'), 'W/"one"')
  assert.deepEqual(
    again.trades.map((row) => row.revision),
    [1],
  )

  const changed = await history.closedTrades(ACCOUNT, null)
  assert.equal(header(sent[2]!, 'If-None-Match'), 'W/"one"')
  assert.deepEqual(
    changed.trades.map((row) => row.revision),
    [2],
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal([...cache.pages.values()][0]!.etag, 'W/"two"')

  // Another account's page is a different key.
  await history.closedTrades('20000000-0000-4000-8000-000000000002', null)
  assert.equal(header(sent[3]!, 'If-None-Match'), null)
})

test('a 304 whose cached page went is asked again in full', async () => {
  const cache = memoryHistoryCache()
  const { fetch, sent } = gateway([
    { status: 200, body: { trades: [summary(1)], next: null }, headers: { ETag: 'W/"one"' } },
    { status: 304 },
    { status: 200, body: { trades: [summary(1)], next: null }, headers: { ETag: 'W/"one"' } },
  ])
  const { history } = client(fetch, cache)
  await history.closedTrades(ACCOUNT, null)
  await new Promise((resolve) => setTimeout(resolve, 0))
  // Corrupt the cached body: it no longer decodes.
  const [key, page] = [...cache.pages.entries()][0]!
  cache.pages.set(key, { ...page, body: { not: 'a page' } })
  const result = await history.closedTrades(ACCOUNT, null)
  assert.equal(result.trades.length, 1)
  assert.equal(header(sent[2]!, 'If-None-Match'), null)
})

test('429 and 503 wait for Retry-After, and the wait holds the next request too', async () => {
  const { fetch, sent } = gateway([
    {
      status: 429,
      body: { error: 'too many', code: 'rate_limited' },
      headers: { 'Retry-After': '3' },
    },
    {
      status: 503,
      body: { error: 'loading', code: 'account_unavailable' },
      headers: { 'Retry-After': '2' },
    },
    { status: 200, body: { trades: [], next: null } },
    {
      status: 429,
      body: { error: 'too many', code: 'rate_limited' },
      headers: { 'Retry-After': '5' },
    },
  ])
  const { history, waits } = client(fetch)
  const told: Array<[number, string]> = []
  const page = await history.closedTrades(ACCOUNT, null, {
    onWait: (ms, code) => told.push([ms, code]),
  })
  assert.deepEqual(page.trades, [])
  assert.deepEqual(waits, [3_000, 2_000])
  assert.deepEqual(told, [
    [3_000, 'rate_limited'],
    [2_000, 'account_unavailable'],
  ])
  assert.equal(sent.length, 3)

  // Out of attempts: the error carries the wait.
  const limited = new HistoryClient({
    baseUrl: '/api',
    fetch,
    maxAttempts: 1,
    sleep: async () => {},
  })
  await assert.rejects(limited.tradeFills(ACCOUNT, TRADE, null), (error: unknown) => {
    assert.ok(error instanceof HistoryRequestError)
    assert.equal(error.code, 'rate_limited')
    assert.equal(error.retryAfterMs, 5_000)
    return true
  })
})

test('a 429 makes the following request wait before it is sent', async () => {
  const { fetch, sent } = gateway([
    { status: 429, body: { error: 'x', code: 'rate_limited' }, headers: { 'Retry-After': '4' } },
    { status: 200, body: { trades: [], next: null } },
  ])
  const waits: number[] = []
  let now = 0
  const history = new HistoryClient({
    baseUrl: '/api',
    fetch,
    maxAttempts: 1,
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms)
      now += ms
    },
  })
  await assert.rejects(history.closedTrades(ACCOUNT, null))
  now += 1_000
  await history.closedTrades(ACCOUNT, null)
  assert.deepEqual(waits, [3_000])
  assert.equal(sent.length, 2)
})

test('Retry-After reads seconds or a date, bounded', () => {
  assert.equal(retryAfterMs('7', 0), 7_000)
  assert.equal(retryAfterMs(null, 0), 2_000)
  assert.equal(retryAfterMs('soon', 0), 2_000)
  assert.equal(retryAfterMs('0', 0), 1_000)
  assert.equal(retryAfterMs('3600', 0), 30_000)
  const now = Date.parse('2026-10-23T10:00:00Z')
  assert.equal(retryAfterMs('Fri, 23 Oct 2026 10:00:05 GMT', now), 5_000)
})

test('refusals carry their code; invalid_cursor drops the route cache', async () => {
  const cache = memoryHistoryCache()
  const { fetch } = gateway([
    { status: 200, body: { trades: [summary(1)], next: 'c2' }, headers: { ETag: 'W/"1"' } },
    { status: 400, body: { error: 'cursor unusable', code: 'invalid_cursor' } },
    { status: 404, body: { error: 'no such trade', code: 'unknown_trade' } },
    { status: 401, body: 'sign in' },
    { status: 200, body: { nonsense: true } },
  ])
  const { history } = client(fetch, cache)
  await history.closedTrades(ACCOUNT, null)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(cache.pages.size, 1)
  await assert.rejects(history.closedTrades(ACCOUNT, 'c2'), { code: 'invalid_cursor', status: 400 })
  assert.equal(cache.pages.size, 0)
  await assert.rejects(history.tradeFills(ACCOUNT, TRADE, null), { code: 'unknown_trade' })
  await assert.rejects(history.tradeFills(ACCOUNT, TRADE, null), { code: 'http_401' })
  await assert.rejects(history.closedTrades(ACCOUNT, null), { code: 'invalid_page' })
})

test('a network failure is a history error, an abort stays an abort', async () => {
  const failing = (async () => {
    throw new TypeError('Failed to fetch')
  }) as typeof fetch
  await assert.rejects(
    new HistoryClient({ baseUrl: '/api', fetch: failing }).closedTrades(ACCOUNT, null),
    {
      code: 'network',
    },
  )
  const aborting = (async () => {
    throw new DOMException('aborted', 'AbortError')
  }) as typeof fetch
  await assert.rejects(
    new HistoryClient({ baseUrl: '/api', fetch: aborting }).closedTrades(ACCOUNT, null),
    {
      name: 'AbortError',
    },
  )
})

test('without IndexedDB, or with a broken one, pages still load', async () => {
  assert.equal(indexedDbHistoryCache(undefined), noHistoryCache)
  const brokenFactory = {
    open() {
      throw new DOMException('denied', 'SecurityError')
    },
  } as unknown as IDBFactory
  const broken = indexedDbHistoryCache(brokenFactory)
  assert.equal(await broken.get('x'), null)
  await broken.put({ key: 'x', etag: 'W/"x"', body: {}, storedAt: 0 })
  const throwing = forgivingHistoryCache({
    get: async () => {
      throw new Error('quota')
    },
    put: async () => {
      throw new Error('quota')
    },
    remove: async () => {
      throw new Error('quota')
    },
    dropPrefix: async () => {
      throw new Error('quota')
    },
    clear: async () => {
      throw new Error('quota')
    },
  })
  const { fetch, sent } = gateway([
    { status: 200, body: { trades: [summary(1)], next: null }, headers: { ETag: 'W/"1"' } },
    { status: 200, body: { trades: [summary(1)], next: null }, headers: { ETag: 'W/"1"' } },
  ])
  for (const cache of [broken, throwing]) {
    const page = await new HistoryClient({ baseUrl: '/api', fetch, cache }).closedTrades(
      ACCOUNT,
      null,
    )
    assert.equal(page.trades.length, 1)
  }
  assert.equal(header(sent[1]!, 'If-None-Match'), null)
})

test('the memory cache keeps the newest pages within its bound', async () => {
  const cache = memoryHistoryCache(2)
  for (const key of ['a', 'b', 'c']) await cache.put({ key, etag: key, body: null, storedAt: 0 })
  assert.deepEqual([...cache.pages.keys()], ['b', 'c'])
  await cache.dropPrefix('b')
  assert.deepEqual([...cache.pages.keys()], ['c'])
})

function summaryPager(pages: Array<Reply | ((cursor: string | null) => Reply)>) {
  const cursors: Array<string | null> = []
  const { fetch } = gateway(
    pages.map((page) => (sent: Sent) => {
      const cursor = sent.url.searchParams.get('before')
      cursors.push(cursor)
      return typeof page === 'function' ? page(cursor) : page
    }),
  )
  const { history, waits } = client(fetch)
  let changes = 0
  const pager = new HistoryPager<TradeSummary>({
    fetchPage: async (cursor, onWait) => {
      const page = await history.closedTrades(ACCOUNT, cursor, { onWait })
      return { items: page.trades, next: page.next }
    },
    id: (row) => row.trade_id,
    keep: newerSummary,
    onChange: () => (changes += 1),
  })
  return { pager, cursors, waits, changes: () => changes }
}

test('the pager walks pages, de-duplicates by trade and keeps the newer revision', async () => {
  const { pager, cursors, changes } = summaryPager([
    { status: 200, body: { trades: [summary(1, 5), summary(2, 1)], next: 'p2' } },
    { status: 200, body: { trades: [summary(2, 3), summary(1, 4), summary(3)], next: null } },
  ])
  assert.equal(pager.status, 'idle')
  assert.equal(await pager.loadMore(), true)
  assert.equal(pager.status, 'idle')
  assert.equal(await pager.loadMore(), true)
  assert.equal(pager.status, 'done')
  assert.equal(await pager.loadMore(), false)
  assert.deepEqual(cursors, [null, 'p2'])
  assert.deepEqual(
    pager.items.map((row) => [row.trade_id, row.revision]),
    [
      ['trade-1', 5],
      ['trade-2', 3],
      ['trade-3', 1],
    ],
  )
  assert.ok(changes() >= 4)
})

test('the pager restarts from the first page on invalid_cursor', async () => {
  const { pager, cursors } = summaryPager([
    { status: 200, body: { trades: [summary(1)], next: 'old' } },
    { status: 400, body: { error: 'cursor unusable', code: 'invalid_cursor' } },
    { status: 200, body: { trades: [summary(1, 2), summary(2)], next: 'new' } },
  ])
  await pager.loadMore()
  await pager.loadMore()
  assert.deepEqual(cursors, [null, 'old', null])
  assert.equal(pager.restarts, 1)
  assert.equal(pager.next, 'new')
  assert.deepEqual(
    pager.items.map((row) => row.revision),
    [2, 1],
  )
})

test('the pager reports backoff waits and keeps a final refusal as its error', async () => {
  const { pager, waits } = summaryPager([
    { status: 429, body: { error: 'x', code: 'rate_limited' }, headers: { 'Retry-After': '1' } },
    { status: 200, body: { trades: [summary(1)], next: 'p2' } },
    { status: 404, body: { error: 'gone', code: 'account_not_found' } },
  ])
  const statuses: string[] = []
  const loading = pager.loadMore()
  statuses.push(pager.status)
  await loading
  assert.deepEqual(waits, [1_000])
  assert.equal(pager.items.length, 1)
  assert.equal(await pager.loadMore(), false)
  assert.equal(pager.status, 'error')
  assert.equal(pager.error?.code, 'account_not_found')
  assert.deepEqual(statuses, ['loading'])
  // A later try asks for the same page again.
  assert.equal(pager.next, 'p2')
})

test('a reset drops the page in flight', async () => {
  let release: () => void = () => {}
  const pager = new HistoryPager<{ id: string }>({
    fetchPage: () =>
      new Promise((resolve) => {
        release = () => resolve({ items: [{ id: 'late' }], next: null })
      }),
    id: (row) => row.id,
  })
  const loading = pager.loadMore()
  pager.reset()
  release()
  assert.equal(await loading, false)
  assert.deepEqual(pager.items, [])
  assert.equal(pager.status, 'idle')
})
