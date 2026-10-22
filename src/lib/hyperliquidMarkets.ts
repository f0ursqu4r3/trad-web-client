import type { HyperliquidMarketTerms } from './marketCatalog.ts'

// Hyperliquid HIP-3 dex markets (`xyz:GOLD`) next to the main perps.
//
// Trad's symbols are upper case (`XYZ:GOLD`); Hyperliquid spells the dex
// prefix in lower case (`xyz:GOLD`). Orders, leverage, subscriptions and
// telemetry use Trad's symbol; screens show the exchange's spelling.

// The HIP-3 dex of a Trad symbol (`xyz` for `XYZ:GOLD`), or null for the
// main dex.
export function marketDex(symbol: string): string | null {
  const separator = symbol.indexOf(':')
  if (separator <= 0) return null
  return symbol.slice(0, separator).trim().toLowerCase() || null
}

// Hyperliquid's spelling when the catalog has not said: the dex prefix in
// lower case, the coin as written.
export function venueSymbolFallback(symbol: string): string {
  const trimmed = symbol.trim()
  const dex = marketDex(trimmed)
  return dex === null ? trimmed : `${dex}:${trimmed.slice(trimmed.indexOf(':') + 1)}`
}

// Parts for display: `{ dex: 'xyz', coin: 'GOLD' }`.
export function marketSymbolParts(
  symbol: string,
  venueSymbol?: string | null,
): { dex: string | null; coin: string; venue: string } {
  const venue = venueSymbol?.trim() || venueSymbolFallback(symbol)
  const dex = marketDex(venue)
  return { dex, coin: dex === null ? venue : venue.slice(venue.indexOf(':') + 1), venue }
}

export function marginModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case 'cross':
      return 'cross margin'
    case 'isolated_only':
      return 'isolated margin only'
    case 'strict_isolated':
      return 'strict isolated margin'
    default:
      return mode ?? 'cross margin'
  }
}

// Trad trades HIP-3 markets with cross margin only, whatever the account's
// own margin mode.
export function leverageMarginMode(
  symbol: string,
  accountMode: 'cross' | 'isolated',
): 'cross' | 'isolated' {
  return marketDex(symbol) === null ? accountMode : 'cross'
}

// In Standard account mode each HIP-3 dex holds its own collateral, reported
// as a balance row named `USDC-XYZ`. Unified Account mode reports no such row.
export function collateralAsset(symbol: string, settlementAsset = 'USDC'): string {
  const dex = marketDex(symbol)
  return dex === null ? settlementAsset : `${settlementAsset}-${dex.toUpperCase()}`
}

export interface CollateralBalance {
  asset: string
  equity?: string | null
  available?: string | null
}

// The refusal the node gives for new xyz exposure while the dex's own
// collateral row is empty; null when the market can be funded.
export function collateralNotice(
  symbol: string,
  balances: readonly CollateralBalance[] | null | undefined,
): string | null {
  const dex = marketDex(symbol)
  if (dex === null || !balances) return null
  const row = balances.find((balance) => balance.asset === collateralAsset(symbol))
  if (row === undefined) return null
  const funded = [row.equity, row.available].some((amount) => Number(amount ?? '0') > 0)
  if (funded) return null
  return `${symbol} needs collateral on Hyperliquid's ${dex} dex: in Standard mode each dex has its own balance. Move USDC to the ${dex} dex, or switch the account to Unified Account mode`
}

// A balance row's label: `USDC-XYZ` is the xyz dex's own collateral.
export function balanceLabel(asset: string): string {
  const match = /^([A-Z0-9]+)-([A-Z0-9]+)$/.exec(asset)
  if (match === null || match[1] !== 'USDC') return asset
  return `${match[1]} · ${match[2]!.toLowerCase()} dex collateral`
}

export interface AccountFeeTier {
  // Hyperliquid `userCrossRate` and `userAddRate`, as fractions (0.00045).
  takerRate: number
  makerRate: number
}

export interface MarketFees {
  // Exchange rates on this market, in basis points.
  takerBps: number
  makerBps: number
  // Builder fee Trad adds to reach the target, in basis points (0 when the
  // exchange fee alone reaches it).
  takerBuilderBps: number
  makerBuilderBps: number
  takerAboveTarget: boolean
  makerAboveTarget: boolean
}

const HYPERLIQUID_BUILDER_CAP_TENTHS_BPS = 100

// The account's tier rates as charged on one market, and the builder fee
// that fills the rest of the all-in target (whole tenths of a basis point,
// floored, capped by the approval and by Hyperliquid's 10 bps).
export function marketFees(
  tier: AccountFeeTier,
  terms: Pick<
    HyperliquidMarketTerms,
    'takerFeeMultiplier' | 'makerFeeMultiplier' | 'makerRebateMultiplier'
  > | null,
  targetTenthsBps: number | null | undefined,
  approvalTenthsBps?: number | null,
): MarketFees {
  const taker = tier.takerRate * Number(terms?.takerFeeMultiplier ?? '1')
  const maker =
    tier.makerRate > 0
      ? tier.makerRate * Number(terms?.makerFeeMultiplier ?? '1')
      : tier.makerRate * Number(terms?.makerRebateMultiplier ?? '1')
  const takerTenths = roundTenths(taker * 100_000)
  const makerTenths = roundTenths(maker * 100_000)
  const target = targetTenthsBps ?? 0
  const builder = (exchangeTenths: number) => {
    if (target <= 0) return 0
    const wanted = Math.max(0, Math.floor(target - exchangeTenths + 1e-9))
    return Math.min(wanted, approvalTenthsBps ?? wanted, HYPERLIQUID_BUILDER_CAP_TENTHS_BPS)
  }
  return {
    takerBps: takerTenths / 10,
    makerBps: makerTenths / 10,
    takerBuilderBps: builder(takerTenths) / 10,
    makerBuilderBps: builder(makerTenths) / 10,
    takerAboveTarget: target > 0 && takerTenths > target,
    makerAboveTarget: target > 0 && makerTenths > target,
  }
}

// "xyz:GOLD taker fee is 8.0 bps, above the 5.5 target; Trad adds no builder
// fee to taker fills", or null when the exchange fee is within the target.
export function aboveTargetNote(
  venueSymbol: string,
  fees: Pick<MarketFees, 'takerBps' | 'makerBps' | 'takerAboveTarget' | 'makerAboveTarget'>,
  targetTenthsBps: number | null | undefined,
): string | null {
  if (!targetTenthsBps) return null
  const target = (targetTenthsBps / 10).toFixed(1)
  if (fees.takerAboveTarget && fees.makerAboveTarget) {
    return `${venueSymbol} taker fee is ${fees.takerBps.toFixed(1)} bps and maker fee is ${fees.makerBps.toFixed(1)} bps, above the ${target} target; Trad adds no builder fee`
  }
  if (fees.takerAboveTarget) {
    return `${venueSymbol} taker fee is ${fees.takerBps.toFixed(1)} bps, above the ${target} target; Trad adds no builder fee to taker fills`
  }
  if (fees.makerAboveTarget) {
    return `${venueSymbol} maker fee is ${fees.makerBps.toFixed(1)} bps, above the ${target} target; Trad adds no builder fee to maker fills`
  }
  return null
}

// The planned all-in rate from an execution preview (a fraction such as
// "0.0008") in basis points.
export function rateBps(rate: string | null | undefined): number | null {
  if (rate === null || rate === undefined) return null
  const value = Number(rate)
  return Number.isFinite(value) ? roundTenths(value * 100_000) / 10 : null
}

// Tenths of a basis point without floating-point noise (80.00000000000001).
function roundTenths(value: number): number {
  return Math.round(value * 1e3) / 1e3
}
