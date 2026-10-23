// Messages a protocol 17 gateway sends in parts (networking work item 21).
//
// No gateway frame is over 64 KiB. A larger message (a snapshot, a resume,
// a history page) arrives as `message_part` frames: a JSON header line,
// then the next slice of the message's JSON text. The parts of one transfer
// come in order and are never interleaved with another transfer's, though
// prices and replies arrive between them. Nothing is handled until the last
// part is in; then the joined text is handled as if it had come whole.
//
// A transfer is abandoned when a part goes missing (an out-of-order part,
// or a new transfer starting before the last one finished) and when its
// socket closes. The first part names the message and its subscription or
// request, so the store can ask again (lib/gateway/client.ts reports it);
// a socket that closed resubscribes everything anyway. A transfer for a
// subscription the page has unsubscribed is dropped without a report: the
// gateway stops sending it too.

import { readTicks } from './marketTicks.ts'
import { parseServerMessage } from './serverMessage.ts'
import type { BrowserClientMessage, BrowserServerMessage } from './wire.ts'

export const MESSAGE_PART_PREFIX = '{"kind":"message_part",'

export interface MessagePartHeader {
  kind: 'message_part'
  transfer: number
  part: number
  parts: number
  // On the first part only.
  message_kind?: string
  request_id?: string
  subscription_id?: string
}

export interface AbandonedTransfer {
  messageKind: string | null
  requestId: string | null
  subscriptionId: string | null
  reason: string
}

export type PartedFrame =
  // Not a part: the frame is a whole message.
  | { kind: 'whole'; text: string; bytes: number }
  // A part of a transfer still under way (or of a dropped one).
  | { kind: 'held'; messageKind: string | null }
  // The last part: the whole message, its size and its frame count.
  | { kind: 'joined'; text: string; bytes: number; frames: number }
  // A part header that does not parse: the frame is invalid.
  | { kind: 'invalid' }

interface Transfer {
  header: MessagePartHeader
  next: number
  chunks: string[]
  bytes: number
}

export class MessageParts {
  private pending: Transfer | null = null
  // Subscriptions unsubscribed while their transfer was under way.
  private readonly dropped = new Set<string>()
  private readonly abandoned: (transfer: AbandonedTransfer) => void

  constructor(abandoned: (transfer: AbandonedTransfer) => void) {
    this.abandoned = abandoned
  }

  accept(text: string): PartedFrame {
    if (!text.startsWith(MESSAGE_PART_PREFIX)) return { kind: 'whole', text, bytes: text.length }
    const newline = text.indexOf('\n')
    const header = newline < 0 ? null : parseHeader(text.slice(0, newline))
    if (header === null) return { kind: 'invalid' }
    const slice = text.slice(newline + 1)
    if (header.part === 0) {
      this.abandon('a new transfer started before the last one finished')
      this.pending = { header, next: 0, chunks: [], bytes: 0 }
    }
    const pending = this.pending
    if (pending === null || pending.header.transfer !== header.transfer) {
      // the rest of a dropped or abandoned transfer
      return { kind: 'held', messageKind: null }
    }
    if (header.part !== pending.next || header.parts !== pending.header.parts) {
      this.abandon(`part ${header.part} arrived where part ${pending.next} was due`)
      return { kind: 'held', messageKind: null }
    }
    pending.chunks.push(slice)
    pending.next += 1
    pending.bytes += text.length
    const messageKind = pending.header.message_kind ?? null
    if (pending.next < pending.header.parts) return { kind: 'held', messageKind }
    this.pending = null
    return {
      kind: 'joined',
      text: pending.chunks.join(''),
      bytes: pending.bytes,
      frames: pending.header.parts,
    }
  }

  // The page unsubscribed: a transfer of that subscription is dropped
  // quietly, here and at the gateway.
  drop(subscriptionId: string): void {
    this.dropped.add(subscriptionId)
    if (this.pending?.header.subscription_id === subscriptionId) this.pending = null
  }

  // The socket closed: whatever was under way is gone with it.
  clear(): void {
    this.pending = null
    this.dropped.clear()
  }

  private abandon(reason: string): void {
    const pending = this.pending
    this.pending = null
    if (pending === null) return
    const subscriptionId = pending.header.subscription_id ?? null
    if (subscriptionId !== null && this.dropped.has(subscriptionId)) return
    this.abandoned({
      messageKind: pending.header.message_kind ?? null,
      requestId: pending.header.request_id ?? null,
      subscriptionId,
      reason,
    })
  }
}

function parseHeader(line: string): MessagePartHeader | null {
  try {
    const header = JSON.parse(line) as Partial<MessagePartHeader>
    const counts = [header.transfer, header.part, header.parts]
    if (header.kind !== 'message_part' || !counts.every(Number.isSafeInteger)) return null
    if (header.part! < 0 || header.part! >= header.parts!) return null
    return header as MessagePartHeader
  } catch {
    return null
  }
}

export type ReadFrame =
  | { kind: 'message'; message: BrowserServerMessage; bytes: number }
  // A part held until its transfer completes; bytes is the frame's size.
  | { kind: 'held'; messageKind: string | null; bytes: number }
  | { kind: 'invalid' }

// Each socket's transfers, for the gateway client: frames in, whole
// messages out (prices as samples, marketTicks.ts). A retiring socket
// keeps its own until it closes.
export class SocketFrames {
  private readonly sockets = new Map<object, MessageParts>()
  private readonly abandoned: (transfer: AbandonedTransfer) => void

  constructor(abandoned: (transfer: AbandonedTransfer) => void) {
    this.abandoned = abandoned
  }

  read(socket: object, raw: unknown): ReadFrame {
    const text = frameText(raw)
    if (text === null) return { kind: 'invalid' }
    let parts = this.sockets.get(socket)
    if (parts === undefined) {
      parts = new MessageParts(this.abandoned)
      this.sockets.set(socket, parts)
    }
    const frame = parts.accept(text)
    switch (frame.kind) {
      case 'invalid':
        return frame
      case 'held':
        return { kind: 'held', messageKind: frame.messageKind, bytes: text.length }
      case 'whole':
      case 'joined': {
        const message = parseServerMessage(frame.text)
        if (message === null) return { kind: 'invalid' }
        return { kind: 'message', message: readTicks(message), bytes: frame.bytes }
      }
    }
  }

  // `message` went out on `socket`: an unsubscribe drops its transfer.
  sent(socket: object | null, message: BrowserClientMessage): void {
    if (socket === null) return
    if (message.kind !== 'unsubscribe_account' && message.kind !== 'unsubscribe_market') return
    this.sockets.get(socket)?.drop(message.subscription_id)
  }

  forget(socket: object): void {
    this.sockets.get(socket)?.clear()
    this.sockets.delete(socket)
  }
}

function frameText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw)
  return null
}
