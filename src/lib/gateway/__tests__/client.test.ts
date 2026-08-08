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
