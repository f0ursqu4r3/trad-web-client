import type { TelemetryRecord } from './contract.ts'
import { telemetryMarketSymbol } from './marketObservation.ts'

// How long a connection takes to become useful, as `connection_timing_measured`
// events (docs/networking-2026-10.md, work item 2):
// - socket_connected: page start, reconnect start or lease renewal start to
//   the gateway's hello;
// - snapshot_applied: hello to the first account snapshot applied on that
//   socket, with the snapshot frame's length;
// - first_price: hello to the first price applied for a symbol, once per
//   symbol per connection.
// `reconnect` is false only for the page's first connection.

export type ConnectionTimingStage = 'socket_connected' | 'snapshot_applied' | 'first_price'

export class ConnectionTimingObserver {
  private readonly now: () => number
  private readonly record: (record: TelemetryRecord) => void
  private connected = false
  private everConnected = false
  private reconnect = false
  private connectedAt = 0
  // When the current outage or renewal began; null while healthy.
  private lostAt: number | null = null
  private rotationStartedAt: number | null = null
  private snapshotMeasured = false
  private readonly pricedSymbols = new Set<string>()

  constructor(now: () => number, record: (record: TelemetryRecord) => void) {
    this.now = now
    this.record = record
  }

  socketLost(): void {
    this.connected = false
    if (this.lostAt === null) this.lostAt = this.now()
  }

  rotationStarted(): void {
    this.rotationStartedAt = this.now()
  }

  socketReady(cause: 'initial' | 'lease_rotation'): void {
    const now = this.now()
    // The page's time origin is navigation start, so `0` is page start.
    const startedAt =
      cause === 'lease_rotation' ? (this.rotationStartedAt ?? now) : (this.lostAt ?? 0)
    this.reconnect = this.everConnected
    this.everConnected = true
    this.connected = true
    this.connectedAt = now
    this.lostAt = null
    this.rotationStartedAt = null
    this.snapshotMeasured = false
    this.pricedSymbols.clear()
    this.emit('socket_connected', now - startedAt, null, {})
  }

  snapshotApplied(accountId: string, payloadBytes: number): void {
    if (!this.connected || this.snapshotMeasured) return
    this.snapshotMeasured = true
    this.emit('snapshot_applied', this.now() - this.connectedAt, accountId, {
      payload_bytes: wholeNonNegative(payloadBytes),
    })
  }

  priceApplied(accountId: string, symbol: string): void {
    if (!this.connected) return
    const marketSymbol = telemetryMarketSymbol(symbol)
    if (this.pricedSymbols.has(marketSymbol)) return
    this.pricedSymbols.add(marketSymbol)
    this.emit('first_price', this.now() - this.connectedAt, accountId, {
      market_symbol: marketSymbol,
    })
  }

  private emit(
    stage: ConnectionTimingStage,
    elapsedMs: number,
    accountId: string | null,
    extra: NonNullable<TelemetryRecord['properties']>,
  ): void {
    this.record({
      eventName: 'connection_timing_measured',
      ...(accountId === null ? {} : { accountId }),
      properties: {
        stage,
        elapsed_ms: wholeNonNegative(elapsedMs),
        reconnect: this.reconnect,
        ...extra,
      },
    })
  }
}

export function wholeNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.round(value), Number.MAX_SAFE_INTEGER)
}
