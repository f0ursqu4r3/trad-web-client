import type { BrowserMarketError } from './market.ts'

// Rules for when a typed market symbol may become a gateway market
// subscription, and how failed subscriptions are retried.
//
// Hyperliquid drops the whole shared price connection when it is asked for a
// coin that does not exist, so partial input ("Z", "ZE") must never reach the
// gateway, and a refused symbol must never be retried.

export const MARKET_SYMBOL_DEBOUNCE_MS = 300
export const MARKET_RETRY_INITIAL_MS = 1_000
export const MARKET_RETRY_MAX_MS = 30_000
export const MARKET_RETRY_MAX_ATTEMPTS = 8

export type MarketCatalogState =
  | { status: 'loading' }
  | { status: 'ready'; symbols: readonly string[] }
  | { status: 'unavailable' }

// none: nothing to show; wait: not decided yet; subscribe: a listed market;
// unknown: the account's catalog does not list it.
export type MarketSymbolDecision = 'none' | 'wait' | 'subscribe' | 'unknown'

export function marketSymbolDecision(
  symbol: string,
  catalog: MarketCatalogState,
): MarketSymbolDecision {
  const normalized = symbol.trim().toUpperCase()
  if (normalized === '') return 'none'
  if (catalog.status === 'loading') return 'wait'
  // Without a catalog the gateway is the only judge; it refuses unknown
  // symbols with a non-retryable error, and the debounce keeps partial input
  // from reaching it.
  if (catalog.status === 'unavailable') return 'subscribe'
  return catalog.symbols.includes(normalized) ? 'subscribe' : 'unknown'
}

// retry: transient, try again with backoff; unknown_market: the exchange does
// not list the symbol; final: any other error that retrying cannot fix.
export type MarketErrorClass = 'retry' | 'unknown_market' | 'final'

export function classifyMarketError(error: BrowserMarketError): MarketErrorClass {
  if (error.kind === 'unknown_market') return 'unknown_market'
  if (error.kind !== 'unavailable') return 'final'
  if (error.retryable === true) return 'retry'
  return /unknown|not listed|not found|no such|unsupported/i.test(error.reason ?? '')
    ? 'unknown_market'
    : 'final'
}

// Delay before retry number `attempt` (0-based), or null once retries are spent.
export function marketRetryDelay(attempt: number): number | null {
  if (attempt >= MARKET_RETRY_MAX_ATTEMPTS) return null
  return Math.min(MARKET_RETRY_INITIAL_MS * 2 ** Math.min(attempt, 5), MARKET_RETRY_MAX_MS)
}

export interface Timers {
  set: (callback: () => void, delayMs: number) => number
  clear: (timer: number) => void
}

const browserTimers: Timers = {
  set: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
  clear: (timer) => clearTimeout(timer),
}

export type MarketRetryOutcome = 'scheduled' | 'pending' | 'unwanted' | 'exhausted'

// Per-market retry timers. A retry fires only when the market is still wanted
// at that moment, so a symbol the UI let go of is never resubscribed.
export class MarketRetryScheduler {
  private readonly timers = new Map<string, number>()
  private readonly attemptCounts = new Map<string, number>()
  private readonly isWanted: (key: string) => boolean
  private readonly resubscribe: (key: string) => void
  private readonly clock: Timers

  constructor(
    isWanted: (key: string) => boolean,
    resubscribe: (key: string) => void,
    clock: Timers = browserTimers,
  ) {
    this.isWanted = isWanted
    this.resubscribe = resubscribe
    this.clock = clock
  }

  schedule(key: string, minimumDelayMs?: number): MarketRetryOutcome {
    if (!this.isWanted(key)) return 'unwanted'
    if (this.timers.has(key)) return 'pending'
    const attempt = this.attemptCounts.get(key) ?? 0
    const backoff = marketRetryDelay(attempt)
    if (backoff === null) return 'exhausted'
    this.attemptCounts.set(key, attempt + 1)
    const timer = this.clock.set(() => {
      this.timers.delete(key)
      if (this.isWanted(key)) this.resubscribe(key)
    }, minimumDelayMs ?? backoff)
    this.timers.set(key, timer)
    return 'scheduled'
  }

  attempts(key: string): number {
    return this.attemptCounts.get(key) ?? 0
  }

  exhausted(key: string): boolean {
    return !this.timers.has(key) && marketRetryDelay(this.attempts(key)) === null
  }

  // Stops any pending retry and forgets the attempt count.
  cancel(key: string): void {
    const timer = this.timers.get(key)
    if (timer !== undefined) this.clock.clear(timer)
    this.timers.delete(key)
    this.attemptCounts.delete(key)
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) this.clock.clear(timer)
    this.timers.clear()
    this.attemptCounts.clear()
  }
}

// Holds a typed symbol until it has stopped changing for `delayMs`.
export class DebouncedMarketSymbol {
  private timer: number | null = null
  private readonly delayMs: number
  private readonly settle: (symbol: string) => void
  private readonly clock: Timers

  constructor(delayMs: number, settle: (symbol: string) => void, clock: Timers = browserTimers) {
    this.delayMs = delayMs
    this.settle = settle
    this.clock = clock
  }

  update(symbol: string, immediate = false): void {
    const normalized = symbol.trim().toUpperCase()
    this.cancel()
    if (immediate) {
      this.settle(normalized)
      return
    }
    this.timer = this.clock.set(() => {
      this.timer = null
      this.settle(normalized)
    }, this.delayMs)
  }

  cancel(): void {
    if (this.timer !== null) this.clock.clear(this.timer)
    this.timer = null
  }
}
