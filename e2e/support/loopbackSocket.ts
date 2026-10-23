import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'

// A minimal WebSocket server on 127.0.0.1 for measurements. Playwright's
// routeWebSocket hands each server message to the page by evaluating a
// script with the message inlined as a literal, so a multi-MB frame costs
// the page seconds of script compilation that no browser pays on a real
// socket. This server sends real frames: the browser's network stack
// delivers them as it would in production (minus the network).
//
// Only what the gateway wire needs: text frames, close, no extensions.

export interface LoopbackSocket {
  send(text: string): void
  onMessage(handler: (text: string) => void): void
  onClose(handler: () => void): void
  close(options?: { code?: number; reason?: string }): Promise<void>
}

export interface LoopbackServer {
  url: string
  stop(): Promise<void>
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export async function startLoopbackServer(
  onSocket: (socket: LoopbackSocket) => void,
): Promise<LoopbackServer> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(426).end()
  })
  const open = new Set<Socket>()
  server.on('upgrade', (request, raw: Socket) => {
    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      raw.destroy()
      return
    }
    const accept = createHash('sha1')
      .update(key + GUID)
      .digest('base64')
    raw.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
    raw.setNoDelay(true)
    open.add(raw)
    onSocket(wrap(raw, () => open.delete(raw)))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    url: `ws://127.0.0.1:${port}/ws`,
    async stop() {
      for (const socket of open) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function wrap(raw: Socket, forget: () => void): LoopbackSocket {
  const messageHandlers: Array<(text: string) => void> = []
  const closeHandlers: Array<() => void> = []
  let buffer = Buffer.alloc(0)
  let fragments: Buffer[] = []
  let closed = false

  const finish = () => {
    if (closed) return
    closed = true
    forget()
    for (const handler of closeHandlers) handler()
  }
  raw.on('close', finish)
  raw.on('error', finish)
  raw.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const frame = readFrame(buffer)
      if (frame === null) return
      buffer = buffer.subarray(frame.consumed)
      if (frame.opcode === 0x8) {
        writeFrame(raw, 0x8, frame.payload.subarray(0, 2))
        raw.end()
        return
      }
      if (frame.opcode === 0x9) {
        writeFrame(raw, 0xa, frame.payload)
        continue
      }
      if (frame.opcode !== 0x1 && frame.opcode !== 0x0) continue
      fragments.push(frame.payload)
      if (!frame.fin) continue
      const text = Buffer.concat(fragments).toString('utf8')
      fragments = []
      for (const handler of messageHandlers) handler(text)
    }
  })

  return {
    send(text) {
      if (!closed) writeFrame(raw, 0x1, Buffer.from(text, 'utf8'))
    },
    onMessage(handler) {
      messageHandlers.push(handler)
    },
    onClose(handler) {
      closeHandlers.push(handler)
    },
    async close(options = {}) {
      if (closed) return
      const reason = Buffer.from(options.reason ?? '', 'utf8')
      const payload = Buffer.alloc(2 + reason.length)
      payload.writeUInt16BE(options.code ?? 1000, 0)
      reason.copy(payload, 2)
      writeFrame(raw, 0x8, payload)
      raw.end()
    },
  }
}

function readFrame(
  buffer: Buffer,
): { fin: boolean; opcode: number; payload: Buffer; consumed: number } | null {
  if (buffer.length < 2) return null
  const fin = (buffer[0]! & 0x80) !== 0
  const opcode = buffer[0]! & 0x0f
  const masked = (buffer[1]! & 0x80) !== 0
  let length = buffer[1]! & 0x7f
  let offset = 2
  if (length === 126) {
    if (buffer.length < 4) return null
    length = buffer.readUInt16BE(2)
    offset = 4
  } else if (length === 127) {
    if (buffer.length < 10) return null
    length = Number(buffer.readBigUInt64BE(2))
    offset = 10
  }
  const maskOffset = offset
  if (masked) offset += 4
  if (buffer.length < offset + length) return null
  const payload = Buffer.from(buffer.subarray(offset, offset + length))
  if (masked) {
    for (let index = 0; index < payload.length; index += 1) {
      payload[index]! ^= buffer[maskOffset + (index % 4)]!
    }
  }
  return { fin, opcode, payload, consumed: offset + length }
}

function writeFrame(raw: Socket, opcode: number, payload: Buffer): void {
  let header: Buffer
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length])
  } else if (payload.length < 65_536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  raw.write(Buffer.concat([header, payload]))
}
