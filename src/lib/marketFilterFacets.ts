import type { Device, DeviceState } from '@/stores/devices'
import type { CommandHistoryItem, MarketContext, MarketRef } from '@/lib/ws/protocol'
import {
  accountLabelForContext,
  marketContextAccountId,
  marketContextExchangeLabel,
  marketContextProductKey,
  marketProductLabel,
  marketRefExchangeLabel,
  networkLabel,
  networkLabelForContext,
  normalizeMarketContext,
  type AccountDisplayRecord,
} from '@/lib/marketContext'

export type MarketFilterFacet = {
  exchange: string
  product: string
  account: string | null
  symbol: string | null
}

export type DeviceMarketFacet = MarketFilterFacet & {
  labels: {
    exchange: string | null
    product: string | null
    account: string | null
    network: string | null
  }
}

export type MarketFacetFilters = {
  exchange?: readonly string[]
  product?: readonly string[]
  account?: readonly string[]
  symbol?: readonly string[]
}

export function commandMarketContext(cmd: Pick<CommandHistoryItem, 'command'>) {
  const data = (cmd.command as { data?: { market_context?: unknown } } | undefined)?.data
  const raw = data?.market_context
  if (!raw || typeof raw !== 'object') return null
  return normalizeMarketContext(raw as Record<string, unknown>)
}

export function commandSymbol(cmd: Pick<CommandHistoryItem, 'command' | 'market_ref'>): string | null {
  const refSymbol = cmd.market_ref?.symbol?.trim()
  if (refSymbol) return refSymbol.toUpperCase()
  const data = (cmd.command as { data?: { symbol?: unknown } } | undefined)?.data
  const payloadSymbol = typeof data?.symbol === 'string' ? data.symbol.trim() : ''
  return payloadSymbol ? payloadSymbol.toUpperCase() : null
}

export function commandMarketFacet(
  cmd: Pick<CommandHistoryItem, 'command' | 'market_ref'>,
): MarketFilterFacet | null {
  const context = commandMarketContext(cmd)
  if (!context?.type || context.type === 'none') return null
  return {
    exchange: context.type,
    product: marketContextProductKey(context),
    account: marketContextAccountId(context),
    symbol: commandSymbol(cmd),
  }
}

export function marketFacetMatchesFilters(
  facet: MarketFilterFacet | null | undefined,
  filters: MarketFacetFilters,
): boolean {
  const exchange = facet?.exchange ?? 'none'
  if (filters.exchange?.length && !filters.exchange.includes(exchange)) return false
  const product = facet?.product ?? 'none'
  if (filters.product?.length && !filters.product.includes(product)) return false
  const accountId = facet?.account ?? ''
  if (filters.account?.length && !filters.account.includes(accountId)) return false
  const symbol = facet?.symbol ?? ''
  if (filters.symbol?.length && !filters.symbol.includes(symbol)) return false
  return true
}

export function uniqueFacetValues(
  facets: Iterable<MarketFilterFacet>,
  key: keyof MarketFilterFacet,
): string[] {
  const values = new Set<string>()
  for (const facet of facets) {
    const value = facet[key]
    if (value) values.add(value)
  }
  return Array.from(values).sort()
}

export function commandMarketFacets(commands: readonly CommandHistoryItem[]): Map<string, MarketFilterFacet> {
  const facets = new Map<string, MarketFilterFacet>()
  commands.forEach((cmd) => {
    const facet = commandMarketFacet(cmd)
    if (facet) facets.set(cmd.command_id, facet)
  })
  return facets
}

function hasMarketContext(
  state: DeviceState,
): state is DeviceState & { market_context: MarketContext } {
  return 'market_context' in state
}

export function directMarketContext(device: Pick<Device, 'state'>): MarketContext | null {
  if (!hasMarketContext(device.state)) return null
  return normalizeMarketContext(device.state.market_context)
}

export function deviceSymbol(device: Pick<Device, 'state'>): string | null {
  const symbol = typeof device.state.symbol === 'string' ? device.state.symbol.trim() : ''
  return symbol ? symbol.toUpperCase() : null
}

export function marketContextFacet(
  ctx: MarketContext | null | undefined,
  symbol: string | null,
  accounts: readonly AccountDisplayRecord[],
): DeviceMarketFacet | null {
  if (!ctx?.type || ctx.type === 'none') return null
  const accountId = marketContextAccountId(ctx)
  const product = marketContextProductKey(ctx)
  return {
    exchange: ctx.type,
    product,
    account: accountId,
    symbol,
    labels: {
      exchange: marketContextExchangeLabel(ctx),
      product: marketProductLabel(product),
      account: accountLabelForContext(ctx, accounts),
      network: networkLabelForContext(ctx, accounts),
    },
  }
}

export function marketRefFacet(
  ref: MarketRef | null | undefined,
  fallbackSymbol: string | null,
): DeviceMarketFacet | null {
  if (!ref) return null
  const product = ref.product ?? 'none'
  const refSymbol = ref.symbol?.trim()
  return {
    exchange: ref.exchange,
    product,
    account: ref.trading_account_id ?? null,
    symbol: refSymbol ? refSymbol.toUpperCase() : fallbackSymbol,
    labels: {
      exchange: marketRefExchangeLabel(ref.exchange),
      product: ref.product ? marketProductLabel(ref.product) : null,
      account:
        ref.trading_account_label ??
        (ref.trading_account_id ? `${ref.trading_account_id.slice(0, 8)}...` : null),
      network: ref.network ? networkLabel(ref.network) : null,
    },
  }
}

export function directDeviceMarketFacet(
  device: Pick<Device, 'market_ref' | 'state'>,
  accounts: readonly AccountDisplayRecord[],
): DeviceMarketFacet | null {
  const symbol = deviceSymbol(device)
  return (
    marketRefFacet(device.market_ref, symbol) ??
    marketContextFacet(directMarketContext(device), symbol, accounts)
  )
}

export function inheritedDeviceMarketFacet(
  device: Device,
  byId: Map<string, Device>,
  accounts: readonly AccountDisplayRecord[],
  seen = new Set<string>(),
): DeviceMarketFacet | null {
  if (seen.has(device.id)) return null
  seen.add(device.id)

  const direct = directDeviceMarketFacet(device, accounts)
  if (direct) return direct

  if (device.parent_device) {
    const parent = byId.get(device.parent_device)
    if (parent) {
      const parentFacet = inheritedDeviceMarketFacet(parent, byId, accounts, seen)
      if (parentFacet) return parentFacet
    }
  }

  for (const childId of device.children_devices ?? []) {
    const child = byId.get(childId)
    if (!child) continue
    const childFacet = inheritedDeviceMarketFacet(child, byId, accounts, seen)
    if (childFacet) return childFacet
  }
  return null
}

export function deviceMarketFacets(
  devices: readonly Device[],
  accounts: readonly AccountDisplayRecord[],
): Map<string, DeviceMarketFacet> {
  const byId = new Map(devices.map((device) => [device.id, device]))
  const facets = new Map<string, DeviceMarketFacet>()
  devices.forEach((device) => {
    const facet = inheritedDeviceMarketFacet(device, byId, accounts)
    if (facet) facets.set(device.id, facet)
  })
  return facets
}
