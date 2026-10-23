// Card prices from the last known trade list (networking work item 7): the
// workspace remembers which coins its active trade cards price, and the next
// connection subscribes those coins at once instead of after the account
// snapshot has arrived and the cards have mounted.

// Card prices use a short sample window.
export const CARD_MARKET_LIMIT = 64
const MAX_REMEMBERED_SYMBOLS = 8
const STORAGE_PREFIX = 'trad:card-markets:'

export interface CardMarketStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

// Coin names only, per account; no amounts or trade ids.
export function rememberCardMarkets(
  storage: CardMarketStorage | null,
  accountId: string,
  symbols: readonly string[],
): void {
  if (storage === null) return
  const unique = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))]
    .filter((symbol) => symbol.length > 0)
    .slice(0, MAX_REMEMBERED_SYMBOLS)
  const value = JSON.stringify(unique)
  try {
    if (storage.getItem(STORAGE_PREFIX + accountId) === value) return
    storage.setItem(STORAGE_PREFIX + accountId, value)
  } catch {
    // A full or blocked storage only costs the head start.
  }
}

export function recalledCardMarkets(
  storage: CardMarketStorage | null,
  accountId: string,
): string[] {
  if (storage === null) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_PREFIX + accountId) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0)
      .slice(0, MAX_REMEMBERED_SYMBOLS)
  } catch {
    return []
  }
}

export function browserCardMarketStorage(): CardMarketStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

// Holds one ordinary market demand per remembered coin until the cards have
// mounted and hold their own; the gateway's reference counting keeps it one
// subscription per coin. Holding again for the same account is a no-op, so a
// reconnect or lease renewal never stacks references.
export class CardMarketHold {
  private held: { accountId: string; symbols: string[] } | null = null
  private readonly subscribe: (accountId: string, symbol: string) => void
  private readonly unsubscribe: (accountId: string, symbol: string) => void

  constructor(
    subscribe: (accountId: string, symbol: string) => void,
    unsubscribe: (accountId: string, symbol: string) => void,
  ) {
    this.subscribe = subscribe
    this.unsubscribe = unsubscribe
  }

  account(): string | null {
    return this.held?.accountId ?? null
  }

  hold(accountId: string, symbols: readonly string[]): void {
    if (this.held?.accountId === accountId) return
    this.release()
    const held: string[] = []
    for (const symbol of symbols) {
      try {
        this.subscribe(accountId, symbol)
        held.push(symbol)
      } catch {
        // An invalid remembered symbol is skipped; the cards subscribe anyway.
      }
    }
    this.held = { accountId, symbols: held }
  }

  release(): void {
    const held = this.held
    this.held = null
    if (held === null) return
    for (const symbol of held.symbols) this.unsubscribe(held.accountId, symbol)
  }
}
