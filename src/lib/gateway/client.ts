import type { BrowserClientMessage, BrowserServerMessage } from './wire.ts'
import { BROWSER_PROTOCOL_VERSION } from './wire.ts'
import { parseServerMessage } from './serverMessage.ts'

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
  leaseRenewalLeadMs?: number
  rotationRetryDelayMs?: number
  retiringSocketGraceMs?: number
  createSocket?: (url: string) => GatewaySocket
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
}

const OPEN = 1
const DEFAULT_RECONNECT_DELAY_MS = 1_000
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000
const DEFAULT_PING_INTERVAL_MS = 30_000
const DEFAULT_ROTATION_RETRY_DELAY_MS = 5_000
const DEFAULT_RETIRING_SOCKET_GRACE_MS = 35_000

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
  private leaseRotationTimer: ReturnType<typeof setTimeout> | null = null
  private rotationRetryTimer: ReturnType<typeof setTimeout> | null = null
  private rotationSocket: GatewaySocket | null = null
  private activeLeaseExpiresAt = 0
  // When the planned renewal is due. Background tabs can hold timers back
  // for a minute or more, so incoming frames and tab visibility also check it.
  private leaseRotationDueAt: number | null = null
  private readonly retiringSockets = new Map<GatewaySocket, ReturnType<typeof setTimeout>>()

  private messageHandler: ((message: BrowserServerMessage, frameBytes: number) => void) | null =
    null
  private frameObserver: ((kind: string, frameBytes: number, applyMs: number) => void) | null = null
  private statusHandler: ((status: GatewayConnectionStatus, error: string | null) => void) | null =
    null
  private readyHandler:
    | ((sessionValidForMs: number, cause: 'initial' | 'lease_rotation') => void)
    | null = null
  private leaseRotationHandler:
    | ((phase: 'started' | 'completed' | 'failed', outcomeCode: string) => void)
    | null = null

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
    this.clearLeaseRotationTimers()
    this.closeRotationSocket('client disconnect')
    for (const [retiring, timer] of this.retiringSockets) {
      clearTimeout(timer)
      retiring.close(1000, 'client disconnect')
    }
    this.retiringSockets.clear()
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

  // Starts a planned lease renewal whose timer is overdue. Safe to call often.
  checkLease(now = Date.now()): void {
    if (this.leaseRotationDueAt === null || now < this.leaseRotationDueAt) return
    if (this.stopped || this.fatal || this.status !== 'ready' || this.rotationSocket !== null)
      return
    this.clearLeaseRotationTimers()
    void this.beginLeaseRotation()
  }

  // frameBytes: the frame's length (characters for text frames, which are
  // JSON and nearly all ASCII).
  setMessageHandler(handler: (message: BrowserServerMessage, frameBytes: number) => void): void {
    this.messageHandler = handler
  }

  // Called after each server frame with the time spent parsing and handling
  // it on the main thread.
  setFrameObserver(observer: (kind: string, frameBytes: number, applyMs: number) => void): void {
    this.frameObserver = observer
  }

  setStatusHandler(handler: (status: GatewayConnectionStatus, error: string | null) => void): void {
    this.statusHandler = handler
  }

  setReadyHandler(
    handler: (sessionValidForMs: number, cause: 'initial' | 'lease_rotation') => void,
  ): void {
    this.readyHandler = handler
  }

  setLeaseRotationHandler(
    handler: (phase: 'started' | 'completed' | 'failed', outcomeCode: string) => void,
  ): void {
    this.leaseRotationHandler = handler
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
      if (this.retiringSockets.has(socket)) {
        this.receiveRetiring(event.data)
        return
      }
      if (!this.current(socket, serial)) return
      this.receive(event.data)
    }
    socket.onerror = () => {
      this.options.logger?.warn('Gateway WebSocket transport error')
    }
    socket.onclose = (event) => {
      if (this.retiringSockets.has(socket)) {
        this.forgetRetiringSocket(socket)
        return
      }
      if (!this.current(socket, serial)) return
      this.socket = null
      this.clearPingTimer()
      this.clearLeaseRotationTimers()
      this.closeRotationSocket('active transport closed')
      if (!this.stopped && !this.fatal) {
        this.retry(
          `gateway socket closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''})`,
        )
      }
    }
  }

  private receive(raw: unknown): void {
    this.checkLease()
    const startedAt = performance.now()
    const message = parseServerMessage(raw)
    if (message === null) {
      this.fail('invalid gateway frame', 4002)
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
      this.scheduleLeaseRotation(message.session_valid_for_ms)
      this.readyHandler?.(message.session_valid_for_ms, 'initial')
    } else if (this.status !== 'ready') {
      this.fail(`gateway sent ${message.kind} before hello`, 4002)
      return
    }
    this.dispatch(message, raw, startedAt)
  }

  private dispatch(message: BrowserServerMessage, raw: unknown, startedAt: number): void {
    const bytes = frameLength(raw)
    try {
      this.messageHandler?.(message, bytes)
    } finally {
      this.frameObserver?.(message.kind, bytes, performance.now() - startedAt)
    }
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

  private scheduleLeaseRotation(validForMs: number): void {
    this.clearLeaseRotationTimers()
    this.activeLeaseExpiresAt = Date.now() + validForMs
    const configuredLead = this.options.leaseRenewalLeadMs
    const lead = configuredLead ?? Math.min(60_000, Math.max(1_000, Math.floor(validForMs / 10)))
    const delay = Math.max(0, validForMs - Math.min(validForMs, lead))
    this.leaseRotationDueAt = Date.now() + delay
    this.leaseRotationTimer = setTimeout(() => {
      this.leaseRotationTimer = null
      this.leaseRotationDueAt = null
      void this.beginLeaseRotation()
    }, delay)
  }

  private async beginLeaseRotation(): Promise<void> {
    if (
      this.stopped ||
      this.fatal ||
      this.status !== 'ready' ||
      this.socket === null ||
      this.rotationSocket !== null
    ) {
      return
    }
    this.leaseRotationHandler?.('started', 'planned_renewal')
    const serial = this.connectionSerial
    let ticket: string | null
    try {
      ticket = await this.options.getTicket()
    } catch (error) {
      if (serial === this.connectionSerial && !this.stopped) {
        this.deferLeaseRotation(
          `failed to acquire renewal ticket: ${errorMessage(error)}`,
          'ticket_failed',
        )
      }
      return
    }
    if (serial !== this.connectionSerial || this.stopped || this.status !== 'ready') return
    if (ticket === null || ticket.length === 0) {
      this.deferLeaseRotation('failed to acquire renewal ticket', 'ticket_failed')
      return
    }
    const createSocket = this.options.createSocket ?? ((url) => new WebSocket(url))
    const socket = createSocket(this.options.url)
    socket.binaryType = 'arraybuffer'
    this.rotationSocket = socket
    this.bindRotationSocket(socket, serial, ticket)
  }

  private bindRotationSocket(socket: GatewaySocket, serial: number, ticket: string): void {
    socket.onopen = () => {
      if (!this.currentRotation(socket, serial)) return
      socket.send(
        JSON.stringify({
          kind: 'authenticate',
          protocol_version: BROWSER_PROTOCOL_VERSION,
          ticket,
        }),
      )
    }
    socket.onmessage = (event) => {
      if (!this.currentRotation(socket, serial)) return
      const message = parseServerMessage(event.data)
      if (message === null || message.kind !== 'hello') {
        this.abandonLeaseRotation(
          socket,
          'renewal socket sent an invalid pre-hello frame',
          'invalid_frame',
        )
        return
      }
      if (message.protocol_version !== BROWSER_PROTOCOL_VERSION) {
        this.abandonLeaseRotation(socket, 'renewal socket protocol mismatch', 'protocol_mismatch')
        return
      }
      this.completeLeaseRotation(socket, serial, message.session_valid_for_ms)
    }
    socket.onerror = () => {
      this.options.logger?.warn('Gateway WebSocket lease-renewal transport error')
    }
    socket.onclose = (event) => {
      if (!this.currentRotation(socket, serial)) return
      this.rotationSocket = null
      this.deferLeaseRotation(
        `renewal socket closed (code ${event.code}${event.reason ? `: ${event.reason}` : ''})`,
        'transport_closed',
      )
    }
  }

  private completeLeaseRotation(
    socket: GatewaySocket,
    serial: number,
    sessionValidForMs: number,
  ): void {
    if (!this.currentRotation(socket, serial)) return
    const previous = this.socket
    this.rotationSocket = null
    this.socket = socket
    this.bindSocket(socket, serial, '')
    this.startPingTimer()
    this.scheduleLeaseRotation(sessionValidForMs)
    if (previous !== null) this.retireSocket(previous)
    this.leaseRotationHandler?.('completed', 'replacement_ready')
    this.readyHandler?.(sessionValidForMs, 'lease_rotation')
  }

  private abandonLeaseRotation(socket: GatewaySocket, reason: string, outcomeCode: string): void {
    if (this.rotationSocket !== socket) return
    this.rotationSocket = null
    socket.close(4002, reason.slice(0, 120))
    this.deferLeaseRotation(reason, outcomeCode)
  }

  private deferLeaseRotation(reason: string, outcomeCode: string): void {
    this.options.logger?.warn(reason)
    this.leaseRotationHandler?.('failed', outcomeCode)
    if (this.rotationRetryTimer !== null || this.stopped || this.status !== 'ready') return
    const remaining = this.activeLeaseExpiresAt - Date.now()
    if (remaining <= 1_000) return
    const configured = this.options.rotationRetryDelayMs ?? DEFAULT_ROTATION_RETRY_DELAY_MS
    const delay = Math.min(configured, Math.max(0, remaining - 1_000))
    this.leaseRotationDueAt = Date.now() + delay
    this.rotationRetryTimer = setTimeout(() => {
      this.rotationRetryTimer = null
      this.leaseRotationDueAt = null
      void this.beginLeaseRotation()
    }, delay)
  }

  private retireSocket(socket: GatewaySocket): void {
    const grace = this.options.retiringSocketGraceMs ?? DEFAULT_RETIRING_SOCKET_GRACE_MS
    const timer = setTimeout(() => {
      this.retiringSockets.delete(socket)
      socket.close(1000, 'lease rotated')
    }, grace)
    this.retiringSockets.set(socket, timer)
  }

  private receiveRetiring(raw: unknown): void {
    const startedAt = performance.now()
    const message = parseServerMessage(raw)
    if (message === null) return
    switch (message.kind) {
      case 'command_result':
      case 'command_preview_result':
      case 'position_resolution_result':
      case 'command_history_page':
      case 'command_history_error':
      case 'legacy_command_history_page':
      case 'legacy_command_history_error':
      case 'pong':
        this.dispatch(message, raw, startedAt)
    }
  }

  private forgetRetiringSocket(socket: GatewaySocket): void {
    const timer = this.retiringSockets.get(socket)
    if (timer !== undefined) clearTimeout(timer)
    this.retiringSockets.delete(socket)
  }

  private fail(reason: string, closeCode: number): void {
    this.fatal = true
    this.clearPingTimer()
    this.clearLeaseRotationTimers()
    this.closeRotationSocket('active connection failed')
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

  private currentRotation(socket: GatewaySocket, serial: number): boolean {
    return this.rotationSocket === socket && this.connectionSerial === serial
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

  private clearLeaseRotationTimers(): void {
    if (this.leaseRotationTimer !== null) clearTimeout(this.leaseRotationTimer)
    if (this.rotationRetryTimer !== null) clearTimeout(this.rotationRetryTimer)
    this.leaseRotationTimer = null
    this.rotationRetryTimer = null
    this.leaseRotationDueAt = null
  }

  private closeRotationSocket(reason: string): void {
    const socket = this.rotationSocket
    this.rotationSocket = null
    socket?.close(1000, reason)
  }
}

function frameLength(raw: unknown): number {
  if (typeof raw === 'string') return raw.length
  if (raw instanceof ArrayBuffer) return raw.byteLength
  return 0
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
