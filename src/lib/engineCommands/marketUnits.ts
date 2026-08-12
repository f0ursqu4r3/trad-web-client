import type { AccountRecord } from '@/stores/accounts'

export interface MarketUnits {
  base: string | null
  quote: string | null
}

export function marketUnits(
  account: AccountRecord | null | undefined,
  symbol: string,
): MarketUnits {
  const quote = quoteAsset(account)
  const normalizedSymbol = symbol.trim().toUpperCase().replace(/[-_/]/g, '')
  const base =
    quote && normalizedSymbol.endsWith(quote)
      ? normalizedSymbol.slice(0, -quote.length)
      : normalizedSymbol

  return {
    base: base || null,
    quote,
  }
}

export function labelWithUnit(label: string, unit: string | null | undefined): string {
  return unit ? `${label} (${unit})` : label
}

function quoteAsset(account: AccountRecord | null | undefined): string | null {
  switch (account?.exchange_metadata?.product) {
    case 'usdt_perp':
      return 'USDT'
    case 'usdc_perp':
      return 'USDC'
    default:
      if (account?.exchange === 'hyperliquid') return 'USDC'
      if (account?.exchange === 'bybit' || account?.exchange === 'binance') return 'USDT'
      return null
  }
}
