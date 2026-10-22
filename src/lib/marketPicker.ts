import type { MarketCatalogState } from './gateway/marketSubscriptionPolicy.ts'

// When the market picker's typed text becomes the ticket's market.
//
// Typing only filters the list. The ticket's market, and with it the price
// subscription, changes when the trader picks an option, presses Enter on a
// highlighted or exactly matching option, or leaves the field on an exact
// listed match. Without a catalog the typed symbol is taken as manual entry.

export type MarketPickerEvent =
  // Clicked an option in the list.
  | { kind: 'pick'; symbol: string }
  // Pressed Enter; `highlighted` is the option highlighted in the open list.
  | { kind: 'enter'; highlighted: string | null }
  // Focus left the picker (Tab or a click elsewhere).
  | { kind: 'blur' }

export function normalizeMarketSymbol(value: string): string {
  return value.trim().toUpperCase()
}

// The symbol to make the ticket's market ('' clears it), or null to keep the
// current one.
export function marketPickerCommit(
  text: string,
  committed: string,
  catalog: MarketCatalogState,
  event: MarketPickerEvent,
): string | null {
  const current = normalizeMarketSymbol(committed)
  const candidate = normalizeMarketSymbol(
    event.kind === 'pick'
      ? event.symbol
      : event.kind === 'enter'
        ? (event.highlighted ?? text)
        : text,
  )
  // Leaving an emptied field clears the market; nothing is subscribed for it.
  if (candidate === '') return event.kind === 'blur' && current !== '' ? '' : null
  if (candidate === current) return null
  if (catalog.status !== 'ready') return candidate
  return catalog.symbols.includes(candidate) ? candidate : null
}

// The typed text differs from the ticket's market.
export function marketPickerPending(text: string, committed: string): boolean {
  return normalizeMarketSymbol(text) !== normalizeMarketSymbol(committed)
}

// The message under the field. While the trader is typing there is none: the
// field shows a "press Enter to select" hint instead.
export function marketPickerValidity(
  text: string,
  committed: string,
  catalog: MarketCatalogState,
  focused: boolean,
): string | null {
  if (catalog.status !== 'ready' || catalog.symbols.length === 0) return null
  const typed = normalizeMarketSymbol(text)
  const current = normalizeMarketSymbol(committed)
  if (marketPickerPending(typed, current)) {
    if (focused || typed === '') return null
    return catalog.symbols.includes(typed)
      ? `Press Enter to select ${typed}`
      : `${typed} is not available for this account`
  }
  if (current === '' || catalog.symbols.includes(current)) return null
  return `${current} is not available for this account`
}
