import type { ExactDecimal, PositionSideIntent } from '@/lib/gateway'
import type { MarketPriceRule } from '@/lib/marketCatalog'

export const STOP_PRICE_DISTANCES = ['0.5', '1', '2', '5', '10'] as const
export type StopPriceDistance = (typeof STOP_PRICE_DISTANCES)[number]
export type PriceDirection = 'decrease' | 'increase'

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
  return priceFromReference(
    reference,
    side === 'long' ? 'decrease' : 'increase',
    distance,
    priceRule,
  )
}

export function priceFromReference(
  reference: ExactDecimal,
  direction: PriceDirection,
  distance: StopPriceDistance,
  priceRule?: MarketPriceRule,
): ExactDecimal {
  const parsed = parseDecimal(reference, 'live reference price')
  const outputScale = Math.max(parsed.scale, 2)
  const coefficient = parsed.coefficient * 10n ** BigInt(outputScale - parsed.scale)
  if (coefficient <= 0n) throw new Error('live reference price must be positive')

  const distanceBps = DISTANCE_BPS[distance]
  const factor = direction === 'decrease' ? BASIS - distanceBps : BASIS + distanceBps
  if (priceRule !== undefined) {
    return normalizePrice(coefficient * factor, outputScale + 4, direction, priceRule)
  }
  const rounded = (coefficient * factor + BASIS / 2n) / BASIS
  return decimal(rounded, outputScale)
}

export function priceDistanceFromReference(
  value: ExactDecimal,
  reference: ExactDecimal,
): string | null {
  try {
    const price = parseDecimal(value, 'price')
    const latest = parseDecimal(reference, 'live reference price')
    const scale = Math.max(price.scale, latest.scale)
    const priceUnits = price.coefficient * 10n ** BigInt(scale - price.scale)
    const latestUnits = latest.coefficient * 10n ** BigInt(scale - latest.scale)
    if (priceUnits <= 0n || latestUnits <= 0n) return null
    const delta = priceUnits - latestUnits
    const magnitude = delta < 0n ? -delta : delta
    const hundredths = (magnitude * 10_000n + latestUnits / 2n) / latestUnits
    const sign = delta < 0n ? '−' : delta > 0n ? '+' : ''
    return `${sign}${decimal(hundredths, 2)}%`
  } catch {
    return null
  }
}

function normalizePrice(
  coefficient: bigint,
  scale: number,
  direction: PriceDirection,
  rule: MarketPriceRule,
): ExactDecimal {
  if (rule.kind === 'fixed_tick') return alignToTick(coefficient, scale, direction, rule.tick)
  const rendered = decimal(coefficient, scale)
  const [whole, fraction = ''] = rendered.split('.')
  const integerDigits = whole === '0' ? 0 : whole.length
  const significantDecimals =
    integerDigits > 0
      ? Math.max(0, 5 - integerDigits)
      : (fraction.match(/^0*/)?.[0].length ?? 0) + 5
  const maximumDecimals = Math.max(0, 6 - rule.sizeDecimals)
  return roundScale(
    coefficient,
    scale,
    Math.min(maximumDecimals, significantDecimals),
    direction,
  )
}

function alignToTick(
  coefficient: bigint,
  scale: number,
  direction: PriceDirection,
  tickValue: string,
): ExactDecimal {
  const tick = parseDecimal(tickValue, 'price tick')
  const commonScale = Math.max(scale, tick.scale)
  const valueUnits = coefficient * 10n ** BigInt(commonScale - scale)
  const tickUnits = tick.coefficient * 10n ** BigInt(commonScale - tick.scale)
  const quotient = valueUnits / tickUnits
  const aligned =
    direction === 'increase' && valueUnits % tickUnits !== 0n
      ? (quotient + 1n) * tickUnits
      : quotient * tickUnits
  return decimal(aligned, commonScale)
}

function roundScale(
  coefficient: bigint,
  scale: number,
  targetScale: number,
  direction: PriceDirection,
): ExactDecimal {
  if (scale <= targetScale) return decimal(coefficient, scale)
  const divisor = 10n ** BigInt(scale - targetScale)
  const quotient = coefficient / divisor
  const rounded =
    direction === 'increase' && coefficient % divisor !== 0n ? quotient + 1n : quotient
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
