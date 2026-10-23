// The gateway client's socket, option and handler shapes (client.ts).

import type { AbandonedTransfer } from './messageParts.ts'
import type { BrowserServerMessage } from './wire.ts'

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
  // The signal aborts the request when the client halts.
  getTicket: (signal?: AbortSignal) => Promise<string | null>
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
  pingIntervalMs?: number
  leaseRenewalLeadMs?: number
  rotationRetryDelayMs?: number
  retiringSocketGraceMs?: number
  createSocket?: (url: string) => GatewaySocket
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
  // A protocol 17 message in parts lost a part (messageParts.ts): the
  // store asks for that subscription or request again.
  onTransferAbandoned?: (transfer: AbandonedTransfer) => void
}

// frameBytes: the frame's length (characters for text frames).
export type GatewayMessageHandler = (message: BrowserServerMessage, frameBytes: number) => void
export type GatewayStatusHandler = (status: GatewayConnectionStatus, error: string | null) => void
export type GatewayReadyHandler = (
  sessionValidForMs: number,
  cause: 'initial' | 'lease_rotation',
) => void
export type GatewayLeaseRotationHandler = (
  phase: 'started' | 'completed' | 'failed',
  outcomeCode: string,
) => void
