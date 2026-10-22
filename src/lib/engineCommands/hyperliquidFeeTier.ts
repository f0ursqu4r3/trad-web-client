import type { AccountFeeTier } from '../hyperliquidMarkets.ts'

// The account's Hyperliquid fee tier (`userFees`: `userCrossRate` taker and
// `userAddRate` maker, before any referral discount), read from the public
// info endpoint. Kept for five minutes per address.

const CACHE_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; tier: Promise<AccountFeeTier> }>()

export function loadHyperliquidFeeTier(input: {
  network: 'mainnet' | 'testnet' | string
  user: string
}): Promise<AccountFeeTier> {
  const key = `${input.network}:${input.user.toLowerCase()}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.tier
  const tier = fetchFeeTier(input).catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, tier })
  return tier
}

async function fetchFeeTier(input: { network: string; user: string }): Promise<AccountFeeTier> {
  const host =
    input.network === 'mainnet'
      ? 'https://api.hyperliquid.xyz/info'
      : 'https://api.hyperliquid-testnet.xyz/info'
  const response = await fetch(host, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'userFees', user: input.user }),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Hyperliquid fees returned HTTP ${response.status}`)
  return parseHyperliquidFeeTier(await response.json())
}

export function parseHyperliquidFeeTier(value: unknown): AccountFeeTier {
  const body = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const takerRate = Number(body.userCrossRate)
  const makerRate = Number(body.userAddRate)
  if (
    typeof body.userCrossRate !== 'string' ||
    typeof body.userAddRate !== 'string' ||
    !Number.isFinite(takerRate) ||
    !Number.isFinite(makerRate) ||
    takerRate < 0
  ) {
    throw new Error('Hyperliquid fee tier is invalid')
  }
  return { takerRate, makerRate }
}
