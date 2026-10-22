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
// field shows a "press Enter to select" hint instead. `refusals` holds the
// reason for each listed market that cannot be chosen here (not tradable for
// new exposure).
export function marketPickerValidity(
  text: string,
  committed: string,
  catalog: MarketCatalogState,
  focused: boolean,
  refusals: Readonly<Record<string, string>> = {},
): string | null {
  if (catalog.status !== 'ready' || catalog.symbols.length === 0) return null
  const typed = normalizeMarketSymbol(text)
  const current = normalizeMarketSymbol(committed)
  if (marketPickerPending(typed, current)) {
    if (focused || typed === '') return null
    if (refusals[typed] !== undefined) return refusals[typed]!
    return catalog.symbols.includes(typed)
      ? `Press Enter to select ${typed}`
      : `${typed} is not available for this account`
  }
  if (current === '') return null
  if (refusals[current] !== undefined) return refusals[current]!
  if (catalog.symbols.includes(current)) return null
  return `${current} is not available for this account`
}

export interface MarketPickerOption {
  // Trad's symbol (`XYZ:GOLD`): what the ticket submits.
  symbol: string
  // The exchange's spelling (`xyz:GOLD`): what the list shows.
  venueSymbol: string
  group: string
  // False when the option cannot be chosen here.
  selectable: boolean
  // Why not, or a short note (margin mode) for selectable options.
  note: string | null
}

// Options matching the typed text, grouped in catalog order (main markets,
// then each HIP-3 dex), best matches first within a group. "gold" finds
// xyz:GOLD: the text is matched against the symbol, the exchange spelling
// and the coin after the dex prefix.
export function filterMarketOptions(
  options: readonly MarketPickerOption[],
  text: string,
  limit = 40,
): MarketPickerOption[] {
  const query = normalizeMarketSymbol(text)
  const groups: string[] = []
  for (const option of options) if (!groups.includes(option.group)) groups.push(option.group)
  const ranked = options
    .map((option) => ({ option, rank: matchRank(option, query) }))
    .filter((entry) => entry.rank !== null)
    .sort(
      (left, right) =>
        groups.indexOf(left.option.group) - groups.indexOf(right.option.group) ||
        left.rank! - right.rank! ||
        left.option.symbol.localeCompare(right.option.symbol),
    )
  return ranked.slice(0, limit).map((entry) => entry.option)
}

// 0 exact, 1 coin or symbol starts with the text, 2 contains it; null when
// the option does not match.
function matchRank(option: MarketPickerOption, query: string): number | null {
  if (query === '') return 2
  const symbol = option.symbol
  const coin = symbol.slice(symbol.indexOf(':') + 1)
  if (symbol === query || coin === query) return 0
  if (symbol.startsWith(query) || coin.startsWith(query)) return 1
  return symbol.includes(query) ? 2 : null
}

// The option to highlight first: the best selectable match (an exact symbol
// or coin before a prefix match), else the first selectable option, else -1.
export function bestOptionIndex(options: readonly MarketPickerOption[], text: string): number {
  const query = normalizeMarketSymbol(text)
  let best = -1
  let bestRank = Number.POSITIVE_INFINITY
  options.forEach((option, index) => {
    if (!option.selectable) return
    const rank = matchRank(option, query) ?? Number.POSITIVE_INFINITY
    if (rank < bestRank) {
      best = index
      bestRank = rank
    }
  })
  return best
}
