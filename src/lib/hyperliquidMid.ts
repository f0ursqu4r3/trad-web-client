import { hyperliquidCoin } from './engineCommands/hyperliquidCapacity.ts'
import { marketDex } from './hyperliquidMarkets.ts'

// Hyperliquid's mid price for a Trad symbol. `allMids` lists only the main
// dex unless asked for a HIP-3 dex, and keys each coin by the exchange's own
// spelling (`xyz:GOLD`, `kPEPE`).
export async function fetchHyperliquidMid(
  network: string,
  symbol: string,
  signal?: AbortSignal,
): Promise<number> {
  const endpoint =
    network === 'testnet'
      ? 'https://api.hyperliquid-testnet.xyz/info'
      : 'https://api.hyperliquid.xyz/info'
  const tradSymbol = symbol.trim().toUpperCase()
  const dex = marketDex(tradSymbol)
  const coin = await hyperliquidCoin(network as 'mainnet' | 'testnet', tradSymbol)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dex === null ? { type: 'allMids' } : { type: 'allMids', dex }),
    signal,
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseHyperliquidMid(await response.json(), coin, tradSymbol)
}

export function parseHyperliquidMid(value: unknown, coin: string, tradSymbol: string): number {
  const body = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const price = Number(body[coin] ?? body[tradSymbol])
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No midpoint available for ${coin}`)
  }
  return price
}
