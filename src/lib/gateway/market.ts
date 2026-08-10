import type { ExactDecimal, Uuid } from './intent.ts'

export interface BrowserMarketSample {
  sequence: number
  update_id: Uuid
  generation: number
  received_at_ms: number
  exchange_time_ms: number
  price: ExactDecimal
  trade_id: string
}

export interface BrowserMarketWindow {
  symbol: string
  oldest_sequence: number | null
  next_sequence: number
  samples: BrowserMarketSample[]
}

export type BrowserMarketError =
  | { kind: 'invalid_request'; reason: string }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable'; reason: string; retryable: boolean }
