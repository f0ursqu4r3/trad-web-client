import { NULL_UUID, PROTOCOL_VERSION } from '@/lib/ws/protocol'
import type {
  ClientToServerMessage,
  ClientToServerMessagePayload,
  ServerToClientMessage,
  Uuid,
  ServerToClientPayload,
} from '@/lib/ws/protocol'

export type TradWebClientOptions = {
  url: string
  clientName?: string
  build?: string
  reconnectDelayMs?: number
  /** Maximum delay (ms) between reconnect attempts when using exponential backoff. If omitted, delay stays constant. */
  maxReconnectDelayMs?: number
  /** When true, use exponential backoff (capped by maxReconnectDelayMs) for reconnect attempts. */
  exponentialBackoff?: boolean
  pingIntervalMs?: number
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
}

export type ServerMessageHandler = (message: ServerToClientMessage) => void
export type FatalErrorHandler = (error: string) => void

const DEFAULT_RECONNECT_DELAY_MS = 500
const DEFAULT_PING_INTERVAL_MS = 15_000

export class TradWebClient {
  private readonly options: TradWebClientOptions
  private socket: WebSocket | null = null
  private clientId: Uuid = NULL_UUID
  private handshakeComplete = false
  private reconnectTimer: number | null = null
  private pingTimer: number | null = null
  private stopped = false
  private reconnectAttempts = 0
  private readonly outboundQueue: Array<{
    payload: ClientToServerMessagePayload
    commandId: Uuid
  }> = []

  private onServerMessage: ServerMessageHandler | null = null
  private onFatalError: FatalErrorHandler | null = null

  constructor(options: TradWebClientOptions) {
    if (!options.url) {
      throw new Error('TradWebClient requires a WebSocket url')
    }
    this.options = options
  }

  connect(): void {
    this.stopped = false
    this.clearReconnectTimer()
    this.reconnectAttempts = 0
    this.openSocket()
  }

  disconnect(): void {
    this.stopped = true
    this.clearReconnectTimer()
    this.clearPingTimer()
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'client disconnect')
    }
    this.socket = null
  }

  setServerMessageHandler(handler: ServerMessageHandler): void {
    this.onServerMessage = handler
  }

  setFatalErrorHandler(handler: FatalErrorHandler): void {
    this.onFatalError = handler
  }

  send(payload: ClientToServerMessagePayload, commandId?: Uuid): void {
    const targetCommandId = commandId ?? this.generateUuid()
    if (!this.handshakeComplete) {
      this.outboundQueue.push({ payload, commandId: targetCommandId })
      this.logDebug('Queueing outbound message until ServerHello arrives')
      return
    }
    this.dispatchMessage(payload, targetCommandId)
  }

  private openSocket(): void {
    this.clearPingTimer()
    this.logInfo(`Opening WebSocket to ${this.options.url}`)
    const ws = new WebSocket(this.options.url)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      this.socket = ws
      this.handshakeComplete = false
      this.clientId = this.clientId ?? NULL_UUID
      this.logInfo('WebSocket open')
      this.sendHello()
      this.startPingTimer()
    }

    ws.onmessage = (event) => {
      this.handleServerMessage(event.data)
    }

    ws.onerror = (event) => {
      this.logWarn('WebSocket error', event)
    }

    ws.onclose = (event) => {
      this.logInfo(`WebSocket closed (code=${event.code}, reason=${event.reason || ''})`)
      this.clearPingTimer()
      this.socket = null
      this.handshakeComplete = false
      this.clientId = this.clientId ?? NULL_UUID
      if (!this.stopped) {
        this.scheduleReconnect()
      }
    }
  }

  private handleServerMessage(raw: string | ArrayBufferLike): void {
    let parsed: ServerToClientMessage
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
      parsed = JSON.parse(text) as ServerToClientMessage
    } catch (err) {
      this.logWarn('Failed to parse server message', err)
      return
    }

    const payload = parsed.payload
    if (!payload) {
      this.logWarn('Server message missing payload', parsed)
      return
    }

    // Narrow payload types by discriminant
    switch (payload.kind) {
      case 'ClientIdAssignment': {
        const data = (payload as Extract<ServerToClientPayload, { kind: 'ClientIdAssignment' }>)
          .data
        this.clientId = data.new_client_id
        this.logInfo(`Client ID assigned: ${this.clientId}`)
        break
      }
      case 'ServerHello': {
        const data = (payload as Extract<ServerToClientPayload, { kind: 'ServerHello' }>).data
        if (data.protocol_version !== PROTOCOL_VERSION) {
          const message = `Protocol mismatch (server=${data.protocol_version}, client=${PROTOCOL_VERSION})`
          this.logError(message)
          this.socket?.close(4000, message)
          return
        }
        this.handshakeComplete = true
        this.flushOutboundQueue()
        break
      }
      case 'SetUser': {
        const data = (payload as Extract<ServerToClientPayload, { kind: 'SetUser' }>).data
        this.logInfo(`Authenticated as user ${data.username} (${data.user_id})`)
        break
      }
      case 'FatalServerError': {
        const data = (payload as Extract<ServerToClientPayload, { kind: 'FatalServerError' }>).data
        this.logError(`Fatal error from server: ${data.error}`)
        this.onFatalError?.(data.error)
        break
      }
      case 'ServerError': {
        const data = (payload as Extract<ServerToClientPayload, { kind: 'ServerError' }>).data
        this.logWarn(`Server error: ${data.error}`)
        break
      }
      default:
        break
    }

    this.onServerMessage?.(parsed)
  }

  private sendHello(): void {
    // Send a hello message to the server
    const message: ClientToServerMessage = {
      client_id: this.clientId ?? NULL_UUID,
      command_id: this.generateUuid(),
      payload: {
        kind: 'System',
        data: {
          kind: 'Hello',
          data: {
            protocol_version: PROTOCOL_VERSION,
            client_name: this.options.clientName ?? 'trad-client',
            build: this.options.build ?? null,
          },
        },
      },
    }
    this.logDebug('Sending Hello message', message)
    this.sendRaw(message)
  }

  private dispatchMessage(payload: ClientToServerMessagePayload, commandId: Uuid): void {
    const message: ClientToServerMessage = {
      client_id: this.clientId,
      command_id: commandId,
      payload,
    }
    this.sendRaw(message)
  }

  private sendRaw(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.logWarn('Cannot send message, socket not open')
      return
    }
    try {
      this.socket.send(JSON.stringify(message))
    } catch (err) {
      this.logWarn('Failed to send message', err)
    }
  }

  private flushOutboundQueue(): void {
    if (!this.handshakeComplete) {
      return
    }
    while (this.outboundQueue.length > 0) {
      const { payload, commandId } = this.outboundQueue.shift()!
      this.dispatchMessage(payload, commandId)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return
    }
    this.reconnectAttempts += 1
    const base = this.options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS
    let delay = base
    if (this.options.exponentialBackoff) {
      // exponential backoff: base * 2^(attempt-1)
      delay = base * Math.pow(2, this.reconnectAttempts - 1)
      const max = this.options.maxReconnectDelayMs ?? base * 32
      if (delay > max) delay = max
      // small jitter (+/- up to 10%) to avoid thundering herd if multiple clients
      const jitter = delay * 0.1
      delay = Math.round(delay + (Math.random() * 2 - 1) * jitter)
      if (delay < base) delay = base
    }
    this.logInfo(
      `Reconnecting in ${delay}ms (attempt #${this.reconnectAttempts}$${'{'}this.options.exponentialBackoff ? ', backoff' : ''}${'}'}`,
    )
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delay)
  }

  private startPingTimer(): void {
    const interval = this.options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS
    this.clearPingTimer()
    this.pingTimer = window.setInterval(() => {
      const payload: ClientToServerMessagePayload = {
        kind: 'System',
        data: {
          kind: 'Ping',
          data: {
            client_send_time: Date.now(),
          },
        },
      }
      this.send(payload)
    }, interval)
  }

  private clearPingTimer(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private logDebug(message: string, payload?: unknown): void {
    this.options.logger?.debug?.(message, payload)
  }

  private logInfo(message: string, payload?: unknown): void {
    this.options.logger?.info?.(message, payload)
  }

  private logWarn(message: string, payload?: unknown): void {
    this.options.logger?.warn?.(message, payload)
  }

  private logError(message: string, payload?: unknown): void {
    this.options.logger?.error?.(message, payload)
  }

  private generateUuid(): Uuid {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    const array = new Uint8Array(16)
    if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).getRandomValues === 'function') {
      ;(crypto as Crypto).getRandomValues(array)
    } else {
      for (let i = 0; i < array.length; i += 1) {
        array[i] = Math.floor(Math.random() * 256)
      }
    }
    // RFC4122 v4 formatting
    array[6] = (array[6] & 0x0f) | 0x40
    array[8] = (array[8] & 0x3f) | 0x80
    const hex = Array.from(array, (b) => b.toString(16).padStart(2, '0'))
    return (
      hex.slice(0, 4).join('') +
      '-' +
      hex.slice(4, 6).join('') +
      '-' +
      hex.slice(6, 8).join('') +
      '-' +
      hex.slice(8, 10).join('') +
      '-' +
      hex.slice(10, 16).join('')
    )
  }
}
