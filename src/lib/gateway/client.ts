import type { BrowserClientMessage, BrowserServerMessage } from './wire.ts'
import { BROWSER_PROTOCOL_VERSION } from './wire.ts'

export type GatewayConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'reconnecting'
  | 'error'

export interface GatewaySocket {
  binaryType: BinaryType
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface GatewayWebSocketClientOptions {
  url: string
  getTicket: () => Promise<string | null>
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
  pingIntervalMs?: number
  createSocket?: (url: string) => GatewaySocket
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
}

const OPEN = 1
const DEFAULT_RECONNECT_DELAY_MS = 1_000
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000
const DEFAULT_PING_INTERVAL_MS = 30_000

export class GatewayWebSocketClient {
  private readonly options: GatewayWebSocketClientOptions
  private socket: GatewaySocket | null = null
  private status: GatewayConnectionStatus = 'idle'
  private stopped = true
  private fatal = false
  private connectionSerial = 0
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null

  private messageHandler: ((message: BrowserServerMessage) => void) | null = null
  private statusHandler: ((status: GatewayConnectionStatus, error: string | null) => void) | null =
    null
  private readyHandler: ((sessionValidForMs: number) => void) | null = null

  constructor(options: GatewayWebSocketClientOptions) {
    if (options.url.length === 0) {
      throw new Error('GatewayWebSocketClient requires a WebSocket URL')
    }
    this.options = options
  }

  connect(): void {
    if (!this.stopped && this.status !== 'idle' && this.status !== 'error') return
    this.stopped = false
    this.fatal = false
    this.reconnectAttempts = 0
    this.clearReconnectTimer()
    void this.openConnection(false)
  }

  disconnect(): void {
    this.stopped = true
    this.connectionSerial += 1
    this.clearReconnectTimer()
    this.clearPingTimer()
    const socket = this.socket
    this.socket = null
    if (socket !== null) {
      socket.close(1000, 'client disconnect')
    }
    this.setStatus('idle', null)
  }

  send(message: BrowserClientMessage): void {
    if (message.kind === 'authenticate') {
      throw new Error('authentication is managed by GatewayWebSocketClient')
    }
    if (this.status !== 'ready' || this.socket?.readyState !== OPEN) {
      throw new Error('gateway socket is not ready; message was not queued')
    }
    this.sendRaw(message)
  }

  setMessageHandler(handler: (message: BrowserServerMessage) => void): void {
    this.messageHandler = handler
  }

  setStatusHandler(handler: (status: GatewayConnectionStatus, error: string | null) => void): void {
    this.statusHandler = handler
  }

  setReadyHandler(handler: (sessionValidForMs: number) => void): void {
    this.readyHandler = handler
  }

  private async openConnection(reconnecting: boolean): Promise<void> {
    if (this.stopped || this.socket !== null) return
    const serial = ++this.connectionSerial
    this.setStatus(reconnecting ? 'reconnecting' : 'connecting', null)

    let ticket: string | null
    try {
      ticket = await this.options.getTicket()
    } catch (error) {
      if (serial !== this.connectionSerial || this.stopped) return
      this.retry(`failed to acquire WebSocket ticket: ${errorMessage(error)}`)
      return
    }
    if (serial !== this.connectionSerial || this.stopped) return
    if (ticket === null || ticket.length === 0) {
      this.retry('failed to acquire WebSocket ticket')
      return
    }

    const createSocket = this.options.createSocket ?? ((url) => new WebSocket(url))
    const socket = createSocket(this.options.url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    this.bindSocket(socket, serial, ticket)
  }

  private bindSocket(socket: GatewaySocket, serial: number, ticket: string): void {
    socket.onopen = () => {
      if (!this.current(socket, serial)) return
      this.setStatus('authenticating', null)
      this.sendRaw({
        kind: 'authenticate',
        protocol_version: BROWSER_PROTOCOL_VERSION,
        ticket,
      })
    }
    socket.onmessage = (event) => {
      if (!this.current(socket, serial)) return
      this.receive(event.data)
    }
    socket.onerror = () => {
      this.options.logger?.warn('Gateway WebSocket transport error')
    }
    socket.onclose = (event) => {
      if (!this.current(socket, serial)) return
      this.socket = null
      this.clearPingTimer()
      if (!this.stopped && !this.fatal) {
        this.retry(
          `gateway socket closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''})`,
        )
      }
    }
  }

  private receive(raw: unknown): void {
    let message: BrowserServerMessage
    try {
      const text =
        typeof raw === 'string'
          ? raw
          : raw instanceof ArrayBuffer
            ? new TextDecoder().decode(raw)
            : null
      if (text === null) throw new Error('unsupported WebSocket frame type')
      const parsed = JSON.parse(text) as unknown
      if (!isServerMessage(parsed)) throw new Error('server frame has no message kind')
      message = parsed
    } catch (error) {
      this.fail(`invalid gateway frame: ${errorMessage(error)}`, 4002)
      return
    }

    if (message.kind === 'hello') {
      if (message.protocol_version !== BROWSER_PROTOCOL_VERSION) {
        this.fail(
          `gateway protocol mismatch: server ${message.protocol_version}, client ${BROWSER_PROTOCOL_VERSION}`,
          4000,
        )
        return
      }
      this.reconnectAttempts = 0
      this.setStatus('ready', null)
      this.startPingTimer()
      this.readyHandler?.(message.session_valid_for_ms)
    } else if (this.status !== 'ready') {
      this.fail(`gateway sent ${message.kind} before hello`, 4002)
      return
    }
    this.messageHandler?.(message)
  }

  private retry(reason: string): void {
    if (this.stopped || this.fatal || this.reconnectTimer !== null) return
    this.reconnectAttempts += 1
    const base = this.options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS
    const maximum = this.options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS
    const exponential = Math.min(maximum, base * 2 ** (this.reconnectAttempts - 1))
    const jittered = Math.max(base, Math.round(exponential * (0.9 + Math.random() * 0.2)))
    this.setStatus('reconnecting', reason)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.openConnection(true)
    }, jittered)
  }

  private fail(reason: string, closeCode: number): void {
    this.fatal = true
    this.clearPingTimer()
    this.setStatus('error', reason)
    const socket = this.socket
    this.socket = null
    socket?.close(closeCode, reason.slice(0, 120))
  }

  private startPingTimer(): void {
    this.clearPingTimer()
    const interval = this.options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS
    this.pingTimer = setInterval(() => {
      if (this.status !== 'ready') return
      this.send({ kind: 'ping', nonce: Date.now() })
    }, interval)
  }

  private sendRaw(message: BrowserClientMessage): void {
    if (this.socket?.readyState !== OPEN) {
      throw new Error('gateway socket is not open')
    }
    this.socket.send(JSON.stringify(message))
  }

  private current(socket: GatewaySocket, serial: number): boolean {
    return this.socket === socket && this.connectionSerial === serial
  }

  private setStatus(status: GatewayConnectionStatus, error: string | null): void {
    this.status = status
    this.statusHandler?.(status, error)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearPingTimer(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}

function isServerMessage(value: unknown): value is BrowserServerMessage {
  return (
    typeof value === 'object' && value !== null && 'kind' in value && typeof value.kind === 'string'
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
