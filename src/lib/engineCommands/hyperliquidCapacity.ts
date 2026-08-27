import type { ExactDecimal, PositionSideIntent } from '../gateway/index.ts'
import type { NetworkType } from '../ws/protocol.ts'

export interface HyperliquidCapacity {
  availableToTrade: ExactDecimal
  maximumBaseQuantity: ExactDecimal
  effectiveLeverage: number
  marginMode: 'cross' | 'isolated'
  observedAtMs: number
}

export async function loadHyperliquidCapacity(input: {
  network: NetworkType
  userAddress: string
  vaultAddress?: string | null
  symbol: string
  positionSide: PositionSideIntent
  signal?: AbortSignal
}): Promise<HyperliquidCapacity> {
  const host =
    input.network === 'mainnet'
      ? 'https://api.hyperliquid.xyz/info'
      : 'https://api.hyperliquid-testnet.xyz/info'
  const response = await fetch(host, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'activeAssetData',
      user: input.vaultAddress || input.userAddress,
      coin: input.symbol.trim().toUpperCase(),
    }),
    signal: input.signal,
  })
  if (!response.ok) throw new Error(`Hyperliquid capacity returned HTTP ${response.status}`)
  return parseHyperliquidCapacity(await response.json(), input.positionSide, Date.now())
}

export function parseHyperliquidCapacity(
  value: unknown,
  positionSide: PositionSideIntent,
  observedAtMs: number,
): HyperliquidCapacity {
  if (typeof value !== 'object' || value === null) throw new Error('capacity response is not an object')
  const record = value as Record<string, unknown>
  const leverage = record.leverage as Record<string, unknown> | undefined
  const marginMode = leverage?.type
  const effectiveLeverage = leverage?.value
  const sideIndex = positionSide === 'long' ? 0 : 1
  const availableToTrade = exactAt(record.availableToTrade, sideIndex)
  const maximumBaseQuantity = exactAt(record.maxTradeSzs, sideIndex)
  if (
    (marginMode !== 'cross' && marginMode !== 'isolated') ||
    typeof effectiveLeverage !== 'number' ||
    !Number.isSafeInteger(effectiveLeverage) ||
    effectiveLeverage < 1
  ) {
    throw new Error('capacity response has invalid leverage')
  }
  return {
    availableToTrade,
    maximumBaseQuantity,
    effectiveLeverage,
    marginMode,
    observedAtMs,
  }
}

function exactAt(value: unknown, index: number): ExactDecimal {
  if (!Array.isArray(value)) throw new Error('capacity side values are unavailable')
  const exact = value[index]
  if (typeof exact !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(exact)) {
    throw new Error('capacity side value is not an exact nonnegative decimal')
  }
  return exact
}
