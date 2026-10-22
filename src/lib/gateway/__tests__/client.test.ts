import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GatewayWebSocketClient,
  type GatewayConnectionStatus,
  type GatewaySocket,
} from '../client.ts'
import { BROWSER_PROTOCOL_VERSION } from '../wire.ts'

test('the ticket-auth frame is first and application messages wait for hello', async () => {
  const sockets: FakeSocket[] = []
  const statuses: GatewayConnectionStatus[] = []
  const client = clientWithSockets(sockets, async () => 'one-time-ticket')
  client.setStatusHandler((status) => statuses.push(status))
  client.connect()
  await settle()

  const socket = requiredSocket(sockets, 0)
  assert.throws(
    () => client.send({ kind: 'subscribe_account', request_id: 'r', account_id: 'a' }),
    /not ready/,
  )
  socket.open()
  assert.deepEqual(socket.sent, [
    JSON.stringify({
      kind: 'authenticate',
      protocol_version: BROWSER_PROTOCOL_VERSION,
      ticket: 'one-time-ticket',
    }),
  ])

  socket.receive({
    kind: 'hello',
    protocol_version: BROWSER_PROTOCOL_VERSION,
    session_valid_for_ms: 30_000,
  })
  client.send({ kind: 'subscribe_account', request_id: 'r', account_id: 'a' })
  assert.equal(JSON.parse(socket.sent[1] ?? '').kind, 'subscribe_account')
  assert.deepEqual(statuses, ['connecting', 'authenticating', 'ready'])
  client.disconnect()
})

test('every reconnect acquires a fresh one-time ticket', async () => {
  const sockets: FakeSocket[] = []
  const tickets = ['ticket-1', 'ticket-2']
  let ticketRequests = 0
  const client = clientWithSockets(sockets, async () => tickets[ticketRequests++] ?? null, {
    reconnectDelayMs: 0,
    maxReconnectDelayMs: 0,
  })
  client.connect()
  await settle()

  requiredSocket(sockets, 0).open()
  requiredSocket(sockets, 0).receive({
    kind: 'hello',
    protocol_version: BROWSER_PROTOCOL_VERSION,
    session_valid_for_ms: 30_000,
  })
  requiredSocket(sockets, 0).serverClose(1012, 'restart')
  await settle(10)

  const second = requiredSocket(sockets, 1)
  second.open()
  assert.equal(JSON.parse(second.sent[0] ?? '').ticket, 'ticket-2')
  assert.equal(ticketRequests, 2)
  client.disconnect()
})

test('planned lease rotation authenticates before switching and keeps late replies', async () => {
  const sockets: FakeSocket[] = []
  const statuses: GatewayConnectionStatus[] = []
  const readyCauses: string[] = []
  const messages: string[] = []
  const tickets = ['ticket-1', 'ticket-2']
  let ticketRequests = 0
  const client = clientWithSockets(sockets, async () => tickets[ticketRequests++] ?? null, {
    leaseRenewalLeadMs: 25,
    retiringSocketGraceMs: 20,
  })
  client.setStatusHandler((status) => statuses.push(status))
  client.setReadyHandler((_validForMs, cause) => readyCauses.push(cause))
  client.setMessageHandler((message) => messages.push(message.kind))
  client.connect()
  await settle()

  const first = requiredSocket(sockets, 0)
  first.open()
  first.receive({
    kind: 'hello',
    protocol_version: BROWSER_PROTOCOL_VERSION,
    session_valid_for_ms: 30,
  })
  await settle(10)

  const replacement = requiredSocket(sockets, 1)
  assert.equal(first.closeCode, null)
  client.send({ kind: 'ping', nonce: 1 })
  assert.equal(JSON.parse(first.sent.at(-1) ?? '').nonce, 1)

  replacement.open()
  assert.equal(JSON.parse(replacement.sent[0] ?? '').ticket, 'ticket-2')
  replacement.receive({
    kind: 'hello',
    protocol_version: BROWSER_PROTOCOL_VERSION,
    session_valid_for_ms: 10_000,
  })

  client.send({ kind: 'ping', nonce: 2 })
  assert.equal(JSON.parse(replacement.sent.at(-1) ?? '').nonce, 2)
  first.receive({ kind: 'account_delta' })
  first.receive({ kind: 'command_result' })
  first.receive({ kind: 'pong', nonce: 1 })
  assert.deepEqual(messages, ['hello', 'command_result', 'pong'])
  assert.deepEqual(readyCauses, ['initial', 'lease_rotation'])
  assert.deepEqual(statuses, ['connecting', 'authenticating', 'ready'])

  await settle(25)
  assert.equal(first.closeCode, 1000)
  client.disconnect()
})

test('a failed planned renewal leaves the current ready socket usable', async () => {
  const sockets: FakeSocket[] = []
  let ticketRequests = 0
  let finalStatus: GatewayConnectionStatus = 'idle'
  const client = clientWithSockets(
    sockets,
    async () => {
      ticketRequests += 1
      if (ticketRequests === 1) return 'ticket-1'
      throw new Error('ticket service unavailable')
    },
    { leaseRenewalLeadMs: 10 },
  )
  client.setStatusHandler((status) => {
    finalStatus = status
  })
  client.connect()
  await settle()

  const socket = requiredSocket(sockets, 0)
  socket.open()
  socket.receive({
    kind: 'hello',
    protocol_version: BROWSER_PROTOCOL_VERSION,
    session_valid_for_ms: 15,
  })
  await settle(10)

  assert.equal(finalStatus, 'ready')
  assert.equal(sockets.length, 1)
  client.send({ kind: 'ping', nonce: 7 })
  assert.equal(JSON.parse(socket.sent.at(-1) ?? '').nonce, 7)
  client.disconnect()
})

test('repeated lease rotations keep one ready transport and send every action once', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 0 })
  const sockets: FakeSocket[] = []
  const statuses: GatewayConnectionStatus[] = []
  let ticket = 0
  const client = clientWithSockets(sockets, async () => `ticket-${++ticket}`, {
    pingIntervalMs: 10_000_000,
    retiringSocketGraceMs: 35_000,
  })
  client.setStatusHandler((status) => statuses.push(status))
  client.connect()
  await flushPromises()

  const first = requiredSocket(sockets, 0)
  first.open()
  first.receive(hello(600_000))
  client.send(action('before-first-rotation'))

  t.mock.timers.tick(540_000)
  await flushPromises()
  const second = requiredSocket(sockets, 1)
  client.send(action('during-first-rotation'))
  second.open()
  second.receive(hello(600_000))
  client.send(action('after-first-rotation'))

  t.mock.timers.tick(540_000)
  await flushPromises()
  const third = requiredSocket(sockets, 2)
  client.send(action('during-second-rotation'))
  third.open()
  third.receive(hello(600_000))
  client.send(action('after-second-rotation'))

  assert.deepEqual(statuses, ['connecting', 'authenticating', 'ready'])
  assert.deepEqual(actionIds(sockets), [
    'before-first-rotation',
    'during-first-rotation',
    'after-first-rotation',
    'during-second-rotation',
    'after-second-rotation',
  ])
  assert.equal(ticket, 3)
  client.disconnect()
})

test('an overdue renewal starts from the next frame when a background tab starves its timer', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 0 })
  const sockets: FakeSocket[] = []
  let ticket = 0
  const client = clientWithSockets(sockets, async () => `ticket-${++ticket}`, {
    pingIntervalMs: 10_000_000,
  })
  client.connect()
  await flushPromises()
  const first = requiredSocket(sockets, 0)
  first.open()
  first.receive(hello(600_000))

  // The wall clock passes the renewal point but the throttled timer has not
  // fired: a check before that point does nothing.
  t.mock.timers.setTime(539_000)
  client.checkLease()
  await flushPromises()
  assert.equal(sockets.length, 1)

  t.mock.timers.setTime(560_000)
  first.receive({ kind: 'pong', nonce: 1 })
  await flushPromises()
  const replacement = requiredSocket(sockets, 1)
  replacement.open()
  assert.equal(JSON.parse(replacement.sent[0] ?? '').ticket, 'ticket-2')
  replacement.receive(hello(600_000))

  // The starved timer was cancelled, so it does not start a second renewal.
  t.mock.timers.tick(600_000)
  await flushPromises()
  assert.equal(ticket, 3)
  assert.equal(sockets.length, 3)
  client.checkLease()
  await flushPromises()
  assert.equal(sockets.length, 3)
  client.disconnect()
})

test('a delayed renewal ticket leaves the active socket usable until handoff', async () => {
  const sockets: FakeSocket[] = []
  let resolveRenewal: ((ticket: string) => void) | null = null
  let ticketRequest = 0
  const client = clientWithSockets(
    sockets,
    async () => {
      ticketRequest += 1
      if (ticketRequest === 1) return 'initial-ticket'
      return new Promise<string>((resolve) => {
        resolveRenewal = resolve
      })
    },
    { leaseRenewalLeadMs: 10, pingIntervalMs: 60_000 },
  )
  client.connect()
  await settle()
  const first = requiredSocket(sockets, 0)
  first.open()
  first.receive(hello(15))
  await settle(10)

  client.send(action('while-ticket-delayed'))
  assert.equal(sockets.length, 1)
  resolveRenewal?.('renewal-ticket')
  await flushPromises()
  const replacement = requiredSocket(sockets, 1)
  replacement.open()
  replacement.receive(hello(60_000))

  assert.deepEqual(actionIds(sockets), ['while-ticket-delayed'])
  assert.equal(first.closeCode, null)
  client.disconnect()
})

test('losing the active transport abandons an unfinished rotation before reconnecting', async () => {
  const sockets: FakeSocket[] = []
  let ticket = 0
  const client = clientWithSockets(sockets, async () => `ticket-${++ticket}`, {
    leaseRenewalLeadMs: 10,
    reconnectDelayMs: 0,
    maxReconnectDelayMs: 0,
  })
  client.connect()
  await settle()
  const first = requiredSocket(sockets, 0)
  first.open()
  first.receive(hello(15))
  await settle(10)
  const unfinishedReplacement = requiredSocket(sockets, 1)
  unfinishedReplacement.open()

  first.serverClose(1012, 'lease revoked')
  await settle(10)

  assert.equal(unfinishedReplacement.closeCode, 1000)
  assert.equal(sockets.length, 3)
  client.disconnect()
})

test('a protocol mismatch is fatal and does not reconnect', async () => {
  const sockets: FakeSocket[] = []
  let finalStatus: GatewayConnectionStatus = 'idle'
  let finalError: string | null = null
  const client = clientWithSockets(sockets, async () => 'ticket', {
    reconnectDelayMs: 0,
    maxReconnectDelayMs: 0,
  })
  client.setStatusHandler((status, error) => {
    finalStatus = status
    finalError = error
  })
  client.connect()
  await settle()

  const socket = requiredSocket(sockets, 0)
  socket.open()
  socket.receive({ kind: 'hello', protocol_version: 99, session_valid_for_ms: 30_000 })
  await settle(10)

  assert.equal(finalStatus, 'error')
  assert.match(finalError ?? '', /protocol mismatch/)
  assert.equal(socket.closeCode, 4000)
  assert.equal(sockets.length, 1)
  client.disconnect()
})

test('malformed frames fail closed instead of being ignored', async () => {
  const sockets: FakeSocket[] = []
  let finalStatus: GatewayConnectionStatus = 'idle'
  const client = clientWithSockets(sockets, async () => 'ticket')
  client.setStatusHandler((status) => {
    finalStatus = status
  })
  client.connect()
  await settle()

  const socket = requiredSocket(sockets, 0)
  socket.open()
  socket.receiveRaw('{not-json')

  assert.equal(finalStatus, 'error')
  assert.equal(socket.closeCode, 4002)
  client.disconnect()
})

function clientWithSockets(
  sockets: FakeSocket[],
  getTicket: () => Promise<string | null>,
  overrides: Partial<ConstructorParameters<typeof GatewayWebSocketClient>[0]> = {},
): GatewayWebSocketClient {
  return new GatewayWebSocketClient({
    url: 'ws://gateway.test/ws',
    getTicket,
    pingIntervalMs: 60_000,
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    ...overrides,
  })
}

function hello(sessionValidForMs: number) {
  return {
    kind: 'hello' as const,
    protocol_version: BROWSER_PROTOCOL_VERSION,
    session_valid_for_ms: sessionValidForMs,
  }
}

function action(requestId: string) {
  return { kind: 'subscribe_account' as const, request_id: requestId, account_id: 'account' }
}

function actionIds(sockets: FakeSocket[]): string[] {
  return sockets.flatMap((socket) =>
    socket.sent
      .map((message) => JSON.parse(message) as { kind: string; request_id?: string })
      .filter((message) => message.kind === 'subscribe_account')
      .map((message) => message.request_id!),
  )
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

class FakeSocket implements GatewaySocket {
  binaryType: BinaryType = 'blob'
  readyState = 0
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  sent: string[] = []
  closeCode: number | null = null

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('socket is not open')
    this.sent.push(data)
  }

  close(code = 1000, reason = ''): void {
    this.closeCode = code
    this.readyState = 3
    this.onclose?.({ code, reason } as CloseEvent)
  }

  open(): void {
    this.readyState = 1
    this.onopen?.({} as Event)
  }

  receive(message: unknown): void {
    this.receiveRaw(JSON.stringify(message))
  }

  receiveRaw(data: string): void {
    this.onmessage?.({ data } as MessageEvent)
  }

  serverClose(code: number, reason: string): void {
    this.readyState = 3
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

function requiredSocket(sockets: FakeSocket[], index: number): FakeSocket {
  const socket = sockets[index]
  assert.notEqual(socket, undefined)
  return socket
}

async function settle(delayMs = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}
