import type { TelemetryRecord } from './contract.ts'

export type MarketStreamState =
  | 'subscribing'
  | 'waiting_for_sample'
  | 'ready'
  | 'reconnecting'
  | 'stale'
  | 'error'

export type MarketStreamReason =
  | 'unauthorized'
  | 'unavailable'
  | 'invalid_request'
  | 'invalid_window'
  | 'invalid_samples'
  | 'window_not_installed'
  | 'send_failed'

interface MarketObservation {
  requestId?: string | null
  source?:
    | 'request'
    | 'window'
    | 'samples'
    | 'market_error'
    | 'feed_health'
    | 'client_validation'
    | 'card'
  reasonCode?: MarketStreamReason
  retryCount?: number
  sampleCount?: number
  lastSampleReceivedAtMs?: number | null
}

export function marketStreamEvent(
  accountId: string,
  symbol: string,
  state: MarketStreamState,
  observation: MarketObservation = {},
  now = Date.now(),
): TelemetryRecord {
  const properties: NonNullable<TelemetryRecord['properties']> = {
    market_symbol: telemetryMarketSymbol(symbol),
    state,
  }
  if (observation.source !== undefined) properties.source = observation.source
  if (observation.reasonCode !== undefined) properties.reason_code = observation.reasonCode
  if (observation.retryCount !== undefined) properties.retry_count = observation.retryCount
  if (observation.sampleCount !== undefined) properties.sample_count = observation.sampleCount
  if (observation.lastSampleReceivedAtMs !== undefined) {
    properties.market_sample_age_bucket = marketSampleAgeBucket(
      observation.lastSampleReceivedAtMs,
      now,
    )
  }
  return {
    eventName: 'market_stream_state_changed',
    accountId,
    ...(observation.requestId ? { requestId: observation.requestId } : {}),
    properties,
  }
}

export function marketSampleAgeBucket(receivedAtMs: number | null, now: number): string {
  if (receivedAtMs === null || !Number.isFinite(receivedAtMs)) return 'none'
  const age = now - receivedAtMs
  if (age < -1_000) return 'clock_skew'
  if (age < 1_000) return 'under_1s'
  if (age < 5_000) return 'under_5s'
  if (age < 15_000) return 'under_15s'
  if (age < 60_000) return 'stale_under_60s'
  return 'stale_over_60s'
}

export function telemetryMarketSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase()
  if (/^@[0-9]{1,12}$/.test(normalized)) return `SPOT:${normalized.slice(1)}`
  return /^[A-Z0-9._:/-]{1,32}$/.test(normalized) ? normalized : 'UNKNOWN'
}
