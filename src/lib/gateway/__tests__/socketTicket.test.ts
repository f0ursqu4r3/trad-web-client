import assert from 'node:assert/strict'
import test from 'node:test'

import { GatewayWebSocketClient, type GatewaySocket } from '../client.ts'
import { HistoryClient } from '../historyClient.ts'
import { memoryHistoryCache } from '../historyCache.ts'
import {
  forgetHistoryRoute,
  historyRoute,
  issuedTicket,
  parseSocketTicket,
  rememberHistoryRoute,
  socketUrl,
  type HistoryRoute,
  type SocketTicket,
} from '../socketTicket.ts'
import { BROWSER_PROTOCOL_VERSION } from '../wire.ts'

const BASE = 'wss://trad.example/ws'
const ACCOUNT = '10000000-0000-4000-8000-000000000001'

function cellTicket(token: string): SocketTicket {
  return {
    token,
    wsUrl: '/ws/krio',
    historyUrl: '/ws/krio/api',
    historyToken: `pass-${token}`,
  }
}

test('a ticket names its socket path; anything else falls back to /ws', () => {
  assert.deepEqual(
    parseSocketTicket({
      token: 't1.1.abc.def',
      expires_in: 30,
      ws_url: '/ws/krio',
      history_url: '/ws/krio/api',
      history_token: 'h1.1.abc.def',
    }),
    {
      token: 't1.1.abc.def',
      wsUrl: '/ws/krio',
      historyUrl: '/ws/krio/api',
      historyToken: 'h1.1.abc.def',
    },
  )
  // today's gateway, an older one, and paths it would never send
  for (const ws_url of ['/ws', undefined, 'wss://elsewhere.example/ws', '/ws/a/b', '/api', 7]) {
    const ticket = parseSocketTicket({ token: 'tok', ws_url })
    assert.equal(ticket?.wsUrl, ws_url === '/ws' ? '/ws' : null, String(ws_url))
    assert.equal(ticket?.historyUrl, null)
  }
  // a history pass needs both halves
  assert.equal(parseSocketTicket({ token: 'tok', history_url: '/ws/krio/api' })?.historyUrl, null)
  for (const body of [null, 'tok', {}, { token: '' }, { token: 3 }]) {
    assert.equal(parseSocketTicket(body), null)
  }
})

test('the socket path is opened on the configured host', () => {
  assert.equal(socketUrl(BASE, '/ws/krio'), 'wss://trad.example/ws/krio')
  assert.equal(socketUrl(BASE, '/ws'), 'wss://trad.example/ws')
  assert.equal(socketUrl('ws://127.0.0.1:8080/ws', '/ws/krio'), 'ws://127.0.0.1:8080/ws/krio')
  assert.equal(socketUrl(BASE, null), BASE)
  assert.deepEqual(issuedTicket('bare-token', BASE), { token: 'bare-token', url: BASE })
  assert.deepEqual(issuedTicket(cellTicket('a'), BASE), {
    token: 'a',
    url: 'wss://trad.example/ws/krio',
  })
  assert.equal(issuedTicket('', BASE), null)
  assert.equal(issuedTicket(null, BASE), null)
})

test('a cell user opens and renews their socket on /ws/<cell>; others stay on /ws', async () => {
  for (const [tickets, expected] of [
    [[cellTicket('one'), cellTicket('two')], 'wss://trad.example/ws/krio'],
    [['one', 'two'], BASE],
    [
      [
        { token: 'one', wsUrl: '/ws', historyUrl: null, historyToken: null },
        { token: 'two', wsUrl: null, historyUrl: null, historyToken: null },
      ],
      BASE,
    ],
  ] as const) {
    const opened: Array<{ url: string; socket: UrlSocket }> = []
    let requested = 0
    const client = new GatewayWebSocketClient({
      url: BASE,
      getTicket: async () => tickets[requested++] ?? null,
      pingIntervalMs: 60_000,
      leaseRenewalLeadMs: 25,
      retiringSocketGraceMs: 20,
      createSocket: (url) => {
        const socket = new UrlSocket()
        opened.push({ url, socket })
        return socket
      },
    })
    client.connect()
    await settle()
    const first = opened[0]!
    first.socket.open()
    assert.equal(JSON.parse(first.socket.sent[0]!).ticket, 'one')
    first.socket.receive({
      kind: 'hello',
      protocol_version: BROWSER_PROTOCOL_VERSION,
      session_valid_for_ms: 30,
    })
    // the planned renewal takes a new ticket and opens where it says
    await settle(15)
    const renewal = opened[1]!
    renewal.socket.open()
    assert.equal(JSON.parse(renewal.socket.sent[0]!).ticket, 'two')
    assert.deepEqual(
      opened.map((socket) => socket.url),
      [expected, expected],
    )
    client.disconnect()
  }
})

test('the latest ticket decides whether history goes to the cell edge', () => {
  rememberHistoryRoute(cellTicket('a'), 'https://trad.example/api')
  assert.deepEqual(historyRoute(), {
    baseUrl: 'https://trad.example/ws/krio/api',
    bearer: 'pass-a',
  })
  rememberHistoryRoute(
    { token: 'b', wsUrl: '/ws', historyUrl: null, historyToken: null },
    'https://trad.example/api',
  )
  assert.equal(historyRoute(), null)
  rememberHistoryRoute(cellTicket('c'), 'https://trad.example/api')
  forgetHistoryRoute()
  assert.equal(historyRoute(), null)
})

test('history pages go to the cell edge with the pass, and renew it once on 401', async () => {
  const sent: Array<{ url: string; authorization: string | null; cookie: string | undefined }> = []
  const replies = [401, 200]
  let route: HistoryRoute | null = { baseUrl: 'https://trad.example/ws/krio/api', bearer: 'old' }
  let renewals = 0
  const history = new HistoryClient({
    baseUrl: '/api',
    route: () => route,
    renewRoute: async () => {
      renewals += 1
      route = { baseUrl: 'https://trad.example/ws/krio/api', bearer: 'new' }
    },
    cache: memoryHistoryCache(),
    fetch: (async (input: string | URL | Request, init: RequestInit = {}) => {
      sent.push({
        url: String(input),
        authorization: new Headers(init.headers).get('Authorization'),
        cookie: init.credentials,
      })
      const status = replies.shift() ?? 500
      return new Response(
        status === 200
          ? JSON.stringify({ trades: [], next: null })
          : '{"code":"history_pass_invalid"}',
        { status },
      )
    }) as typeof fetch,
  })
  const page = await history.closedTrades(ACCOUNT, null)
  assert.deepEqual(page, { trades: [], next: null })
  assert.equal(renewals, 1)
  assert.deepEqual(
    sent.map((call) => [call.url.split('?')[0], call.authorization]),
    [
      [`https://trad.example/ws/krio/api/accounts/${ACCOUNT}/trades`, 'Bearer old'],
      [`https://trad.example/ws/krio/api/accounts/${ACCOUNT}/trades`, 'Bearer new'],
    ],
  )

  // without a cell: today's /api with the cookie and no bearer
  route = null
  replies.push(200)
  await history.closedTrades(ACCOUNT, 'p50')
  const last = sent.at(-1)!
  assert.ok(last.url.startsWith(`/api/accounts/${ACCOUNT}/trades`), last.url)
  assert.equal(last.authorization, null)
  assert.equal(last.cookie, 'include')
})

class UrlSocket implements GatewaySocket {
  binaryType: BinaryType = 'blob'
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  sent: string[] = []

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3
    this.onclose?.({ code, reason } as CloseEvent)
  }

  open(): void {
    this.readyState = 1
    this.onopen?.({} as Event)
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent)
  }
}

async function settle(delayMs = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
