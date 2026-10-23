import type { ExactDecimal, Uuid } from './intent.ts'

export interface BrowserMarketSample {
  sequence: number
  // Protocol 16 only; protocol 17 ticks leave it out.
  update_id?: Uuid
  generation: number
  received_at_ms: number
  exchange_time_ms: number
  price: ExactDecimal
  trade_id: string
}

export interface BrowserMarketWindow {
  symbol: string
  unavailable_reason?: string | null
  oldest_sequence: number | null
  next_sequence: number
  // Protocol 16; empty for 17, which sends `ticks` (read into `samples`).
  samples: BrowserMarketSample[]
  ticks?: BrowserTickRun[]
}

// Protocol 17 prices (networking item 19): one market generation's
// samples as `[sequence, exchange_time_ms, received_at_ms -
// exchange_time_ms, price, trade_id]`, the first two as steps from the
// tick before after the first.
export interface BrowserTickRun {
  generation: number
  ticks: Array<[number, number, number, ExactDecimal, string]>
}

export type BrowserMarketError =
  | { kind: 'invalid_request'; reason: string }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable'; reason: string; retryable: boolean }
  // The exchange does not list the symbol. Never retried.
  | { kind: 'unknown_market'; reason?: string; retryable?: boolean }
