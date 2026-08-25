import type { ExactDecimal, PositionSideIntent } from '@/lib/gateway'

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
): ExactDecimal {
  const match = DECIMAL.exec(reference.trim())
  if (match === null) throw new Error('live reference price is invalid')
  const fraction = match[2] ?? ''
  const inputScale = fraction.length
  const outputScale = Math.max(inputScale, 2)
  const coefficient = BigInt(`${match[1]}${fraction}`) * 10n ** BigInt(outputScale - inputScale)
  if (coefficient <= 0n) throw new Error('live reference price must be positive')

  const distanceBps = DISTANCE_BPS[distance]
  const factor = side === 'long' ? BASIS - distanceBps : BASIS + distanceBps
  const rounded = (coefficient * factor + BASIS / 2n) / BASIS
  return decimal(rounded, outputScale)
}

function decimal(coefficient: bigint, scale: number): ExactDecimal {
  let digits = coefficient.toString().padStart(scale + 1, '0')
  const whole = scale === 0 ? digits : digits.slice(0, -scale)
  const fraction = scale === 0 ? '' : digits.slice(-scale).replace(/0+$/, '')
  return fraction === '' ? whole : `${whole}.${fraction}`
}
