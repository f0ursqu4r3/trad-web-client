// The gateway client's socket and option shapes (client.ts).

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
