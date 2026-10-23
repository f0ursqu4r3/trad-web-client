import assert from 'node:assert/strict'
import test from 'node:test'

import { GatewayWebSocketClient, type GatewaySocket } from '../client.ts'
import { decodeTicks, readTicks } from '../marketTicks.ts'
import { MessageParts, SocketFrames, type AbandonedTransfer } from '../messageParts.ts'
import { transferRecovery } from '../transferRecovery.ts'
import { BROWSER_PROTOCOL_VERSION, type BrowserServerMessage } from '../wire.ts'

// Protocol 17 message parts (networking item 21) and ticks (item 19): the
// frames a gateway writes, joined back into the messages it meant.

// The gateway's split (browser_socket/message_parts.rs): a header line,
// then the next slice; the first part names the message.
function parts(message: unknown, transfer: number, slice = 40): string[] {
  const text = JSON.stringify(message)
  const count = Math.ceil(text.length / slice)
  const named = message as { kind: string; request_id?: string; subscription_id?: string }
  return Array.from({ length: count }, (_, part) => {
    const header: Record<string, unknown> = { kind: 'message_part', transfer, part, parts: count }
    if (part === 0) {
      header.message_kind = named.kind
      if (named.request_id) header.request_id = named.request_id
      if (named.subscription_id) header.subscription_id = named.subscription_id
    }
    return `${JSON.stringify(header)}\n${text.slice(part * slice, (part + 1) * slice)}`
  })
}

const SNAPSHOT = {
  kind: 'account_snapshot',
  request_id: 'request-1',
  subscription_id: 'subscription-1',
  rows: Array.from({ length: 20 }, (_, index) => ({ id: index, note: 'café €' })),
}

test('parts join back into the message, and whole frames pass through', () => {
  const lost: AbandonedTransfer[] = []
  const reader = new MessageParts((transfer) => lost.push(transfer))
  const frames = parts(SNAPSHOT, 1)
  assert.ok(frames.length > 5)
  for (const frame of frames.slice(0, -1)) {
    assert.deepEqual(reader.accept(frame), { kind: 'held', messageKind: 'account_snapshot' })
  }
  const joined = reader.accept(frames.at(-1)!)
  assert.equal(joined.kind, 'joined')
  assert.deepEqual(JSON.parse((joined as { text: string }).text), SNAPSHOT)
  assert.equal((joined as { frames: number }).frames, frames.length)
  const pong = JSON.stringify({ kind: 'pong', nonce: 1 })
  assert.deepEqual(reader.accept(pong), { kind: 'whole', text: pong, bytes: pong.length })
  assert.deepEqual(lost, [])
})

test('a lost part abandons the transfer and names what to ask again', () => {
  const lost: AbandonedTransfer[] = []
  const reader = new MessageParts((transfer) => lost.push(transfer))
  const frames = parts(SNAPSHOT, 3)
  reader.accept(frames[0]!)
  reader.accept(frames[2]!)
  assert.equal(lost.length, 1)
  assert.deepEqual(
    { ...lost[0], reason: undefined },
    {
      messageKind: 'account_snapshot',
      requestId: 'request-1',
      subscriptionId: 'subscription-1',
      reason: undefined,
    },
  )
  // the rest of it is ignored, and the next transfer joins
  for (const frame of frames.slice(3)) assert.equal(reader.accept(frame).kind, 'held')
  const next = parts({ kind: 'command_history_page', request_id: 'history-1' }, 4)
  const results = next.map((frame) => reader.accept(frame))
  assert.equal(results.at(-1)!.kind, 'joined')
  assert.equal(lost.length, 1)
})

test('a transfer starting before the last finished abandons the last', () => {
  const lost: AbandonedTransfer[] = []
  const reader = new MessageParts((transfer) => lost.push(transfer))
  reader.accept(parts(SNAPSHOT, 5)[0]!)
  reader.accept(parts({ kind: 'account_resumed', subscription_id: 's-2' }, 6)[0]!)
  assert.equal(lost[0]?.subscriptionId, 'subscription-1')
})

test('an unsubscribed transfer is dropped without a report', () => {
  const lost: AbandonedTransfer[] = []
  const reader = new MessageParts((transfer) => lost.push(transfer))
  const frames = parts(SNAPSHOT, 7)
  reader.accept(frames[0]!)
  reader.drop('subscription-1')
  assert.equal(reader.accept(frames[1]!).kind, 'held')
  reader.accept(parts({ kind: 'pong' }, 8)[0]!)
  assert.deepEqual(lost, [])
})

test('a part header that does not parse is an invalid frame', () => {
  const reader = new MessageParts(() => {})
  assert.deepEqual(reader.accept('{"kind":"message_part",nope\nxx'), { kind: 'invalid' })
  assert.deepEqual(reader.accept('{"kind":"message_part","transfer":1}'), { kind: 'invalid' })
})

test('each socket joins its own transfers; a closed socket forgets them', () => {
  const lost: AbandonedTransfer[] = []
  const frames = new SocketFrames((transfer) => lost.push(transfer))
  const [left, right] = [{}, {}]
  const a = parts(SNAPSHOT, 1)
  const b = parts({ ...SNAPSHOT, subscription_id: 'subscription-2' }, 1)
  frames.read(left, a[0])
  frames.read(right, b[0])
  frames.forget(right)
  for (const frame of a.slice(1, -1)) frames.read(left, frame)
  const joined = frames.read(left, a.at(-1))
  assert.equal(joined.kind, 'message')
  assert.equal((joined as { message: BrowserServerMessage }).message.kind, 'account_snapshot')
  assert.deepEqual(lost, [])
})

const TICKS = {
  kind: 'market_ticks' as const,
  subscription_id: 'm-1',
  account_id: 'a-1',
  symbol: 'BTC',
  ticks: [
    {
      generation: 3,
      ticks: [
        [9_000_000, 1_761_000_000_000, 40, '64000.5', '912'],
        [1, 180, 41, '64001', '913'],
      ] as Array<[number, number, number, string, string]>,
    },
    {
      generation: 4,
      ticks: [[9_000_007, 1_761_000_009_000, -3, '63999', '920']] as Array<
        [number, number, number, string, string]
      >,
    },
  ],
}

test('ticks read back into samples, without the update id', () => {
  assert.deepEqual(decodeTicks(TICKS.ticks), [
    {
      sequence: 9_000_000,
      generation: 3,
      received_at_ms: 1_761_000_000_040,
      exchange_time_ms: 1_761_000_000_000,
      price: '64000.5',
      trade_id: '912',
    },
    {
      sequence: 9_000_001,
      generation: 3,
      received_at_ms: 1_761_000_000_221,
      exchange_time_ms: 1_761_000_000_180,
      price: '64001',
      trade_id: '913',
    },
    {
      sequence: 9_000_007,
      generation: 4,
      received_at_ms: 1_761_000_008_997,
      exchange_time_ms: 1_761_000_009_000,
      price: '63999',
      trade_id: '920',
    },
  ])
  const samples = readTicks(TICKS)
  assert.equal(samples.kind, 'market_samples')
  const window = readTicks({
    kind: 'market_window',
    request_id: null,
    subscription_id: 'm-1',
    account_id: 'a-1',
    window: {
      symbol: 'BTC',
      oldest_sequence: 9_000_000,
      next_sequence: 9_000_008,
      samples: [],
      ticks: TICKS.ticks,
    },
  })
  assert.equal(window.kind === 'market_window' && window.window.samples.length, 3)
  assert.equal(window.kind === 'market_window' && 'ticks' in window.window, false)
})

class FakeSocket implements GatewaySocket {
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

  receive(data: string): void {
    this.onmessage?.({ data } as MessageEvent)
  }
}

test('the client hands on whole messages, observes parts and reports a lost one', async () => {
  const sockets: FakeSocket[] = []
  const lost: AbandonedTransfer[] = []
  const handled: Array<[string, number]> = []
  const observed: string[] = []
  const client = new GatewayWebSocketClient({
    url: 'ws://gateway.test/ws',
    getTicket: async () => 'ticket',
    pingIntervalMs: 60_000,
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    onTransferAbandoned: (transfer) => lost.push(transfer),
  })
  client.setMessageHandler((message, bytes) => handled.push([message.kind, bytes]))
  client.setFrameObserver((kind) => observed.push(kind))
  client.connect()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const socket = sockets[0]!
  socket.open()
  socket.receive(
    JSON.stringify({
      kind: 'hello',
      protocol_version: BROWSER_PROTOCOL_VERSION,
      session_valid_for_ms: 60_000,
    }),
  )

  const frames = parts(SNAPSHOT, 1)
  for (const frame of frames.slice(0, 2)) socket.receive(frame)
  // a price between parts is handled at once, as samples
  socket.receive(JSON.stringify(TICKS))
  for (const frame of frames.slice(2)) socket.receive(frame)
  assert.deepEqual(
    handled.map(([kind]) => kind),
    ['hello', 'market_samples', 'account_snapshot'],
  )
  const total = frames.reduce((sum, frame) => sum + frame.length, 0)
  assert.equal(handled[2]![1], total)
  assert.equal(
    observed.filter((kind) => kind === 'message_part:account_snapshot').length,
    frames.length - 1,
  )

  // an unsubscribe drops that subscription's transfer quietly
  const second = parts({ ...SNAPSHOT, request_id: undefined, subscription_id: 'subscription-2' }, 2)
  socket.receive(second[0]!)
  client.send({ kind: 'unsubscribe_account', subscription_id: 'subscription-2' })
  socket.receive(parts({ kind: 'command_history_page', request_id: 'h-1' }, 3)[0]!)
  assert.deepEqual(lost, [])

  // a lost part is reported
  const third = parts(SNAPSHOT, 4)
  socket.receive(third[0]!)
  socket.receive(third[2]!)
  assert.equal(lost.length, 2)
  assert.equal(lost[0]?.requestId, 'h-1')
  assert.equal(lost[1]?.subscriptionId, 'subscription-1')
  client.disconnect()
})

test('a lost transfer resubscribes its account or fails its history request', () => {
  const requests = new Map([['request-1', { accountId: 'account-1' }]])
  const accounts = new Map([['subscription-9', 'account-9']])
  const histories = new Map([['history-1', {}]])
  const lost = (fields: Partial<AbandonedTransfer>): AbandonedTransfer => ({
    messageKind: 'account_snapshot',
    requestId: null,
    subscriptionId: null,
    reason: 'test',
    ...fields,
  })
  // a first snapshot, before the page knows its subscription
  assert.deepEqual(
    transferRecovery(
      lost({ requestId: 'request-1', subscriptionId: 'subscription-1' }),
      requests,
      accounts,
      histories,
    ),
    {
      kind: 'resubscribe',
      accountId: 'account-1',
      subscriptionId: 'subscription-1',
      requestId: 'request-1',
    },
  )
  // a resync snapshot of a live subscription
  assert.deepEqual(
    transferRecovery(lost({ subscriptionId: 'subscription-9' }), requests, accounts, histories),
    {
      kind: 'resubscribe',
      accountId: 'account-9',
      subscriptionId: 'subscription-9',
      requestId: null,
    },
  )
  assert.deepEqual(
    transferRecovery(
      lost({ messageKind: 'command_history_page', requestId: 'history-1' }),
      requests,
      accounts,
      histories,
    ),
    { kind: 'fail_history', requestId: 'history-1' },
  )
  // an unsubscribed one
  assert.deepEqual(
    transferRecovery(lost({ subscriptionId: 'gone' }), requests, accounts, histories),
    { kind: 'ignore' },
  )
})
