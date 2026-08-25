import type { ExactDecimal, PositionSideIntent } from '@/lib/gateway'
import type { MarketPriceRule } from '@/lib/marketCatalog'

export const STOP_PRICE_DISTANCES = ['0.5', '1', '2', '5', '10'] as const
export type StopPriceDistance = (typeof STOP_PRICE_DISTANCES)[number]

const DISTANCE_BPS: Record<StopPriceDistance, bigint> = {
  '0.5': 50n,
  '1': 100n,
  '2': 200n,
  '5': 500n,
  '10': 1_000n,
}
const BASIS = 10_000n
const DECIMAL = /^(\d+)(?:\.(\d+))?$/

// Presets are price distance, not leveraged return. Keep the calculation decimal-exact.
export function stopPriceFromReference(
  reference: ExactDecimal,
  side: PositionSideIntent,
  distance: StopPriceDistance,
  priceRule?: MarketPriceRule,
): ExactDecimal {
  const parsed = parseDecimal(reference, 'live reference price')
  const outputScale = Math.max(parsed.scale, 2)
  const coefficient = parsed.coefficient * 10n ** BigInt(outputScale - parsed.scale)
  if (coefficient <= 0n) throw new Error('live reference price must be positive')

  const distanceBps = DISTANCE_BPS[distance]
  const factor = side === 'long' ? BASIS - distanceBps : BASIS + distanceBps
  if (priceRule !== undefined) {
    return normalizeStopPrice(coefficient * factor, outputScale + 4, side, priceRule)
  }
  const rounded = (coefficient * factor + BASIS / 2n) / BASIS
  return decimal(rounded, outputScale)
}

function normalizeStopPrice(
  coefficient: bigint,
  scale: number,
  side: PositionSideIntent,
  rule: MarketPriceRule,
): ExactDecimal {
  if (rule.kind === 'fixed_tick') return alignToTick(coefficient, scale, side, rule.tick)
  const rendered = decimal(coefficient, scale)
  const [whole, fraction = ''] = rendered.split('.')
  const integerDigits = whole === '0' ? 0 : whole.length
  const significantDecimals =
    integerDigits > 0
      ? Math.max(0, 5 - integerDigits)
      : (fraction.match(/^0*/)?.[0].length ?? 0) + 5
  const maximumDecimals = Math.max(0, 6 - rule.sizeDecimals)
  return roundScale(coefficient, scale, Math.min(maximumDecimals, significantDecimals), side)
}

function alignToTick(
  coefficient: bigint,
  scale: number,
  side: PositionSideIntent,
  tickValue: string,
): ExactDecimal {
  const tick = parseDecimal(tickValue, 'price tick')
  const commonScale = Math.max(scale, tick.scale)
  const valueUnits = coefficient * 10n ** BigInt(commonScale - scale)
  const tickUnits = tick.coefficient * 10n ** BigInt(commonScale - tick.scale)
  const quotient = valueUnits / tickUnits
  const aligned =
    side === 'short' && valueUnits % tickUnits !== 0n
      ? (quotient + 1n) * tickUnits
      : quotient * tickUnits
  return decimal(aligned, commonScale)
}

function roundScale(
  coefficient: bigint,
  scale: number,
  targetScale: number,
  side: PositionSideIntent,
): ExactDecimal {
  if (scale <= targetScale) return decimal(coefficient, scale)
  const divisor = 10n ** BigInt(scale - targetScale)
  const quotient = coefficient / divisor
  const rounded = side === 'short' && coefficient % divisor !== 0n ? quotient + 1n : quotient
  return decimal(rounded, targetScale)
}

function parseDecimal(value: string, label: string): { coefficient: bigint; scale: number } {
  const match = DECIMAL.exec(value.trim())
  if (match === null) throw new Error(`${label} is invalid`)
  const fraction = match[2] ?? ''
  return { coefficient: BigInt(`${match[1]}${fraction}`), scale: fraction.length }
}

function decimal(coefficient: bigint, scale: number): ExactDecimal {
  let digits = coefficient.toString().padStart(scale + 1, '0')
  const whole = scale === 0 ? digits : digits.slice(0, -scale)
  const fraction = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '')
  return fraction === '' ? whole : `${whole}.${fraction}`
}
