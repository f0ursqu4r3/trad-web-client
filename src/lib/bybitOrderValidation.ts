import { PositionSide } from '@/lib/ws/protocol'

type OptionalPrice = number | null | ''

function positiveFinite(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value > 0
}

function normalizeOptionalPrice(value: OptionalPrice): number | null {
  if (value === null || value === '') return null
  return value
}

export function bybitTrailingEntryExitLevelError(
  positionSide: PositionSide,
  activationPrice: number | null,
  stopLoss: number | null,
  takeProfit: OptionalPrice,
): string | null {
  if (activationPrice === null || stopLoss === null) return null
  if (!positiveFinite(activationPrice)) return 'Bybit TE activation price must be positive.'
  if (!positiveFinite(stopLoss)) return 'Bybit TE stop loss must be positive.'

  const normalizedTakeProfit = normalizeOptionalPrice(takeProfit)
  if (normalizedTakeProfit !== null && !positiveFinite(normalizedTakeProfit)) {
    return 'Bybit TE take profit must be positive.'
  }

  if (positionSide === PositionSide.Long) {
    if (activationPrice <= stopLoss) {
      return 'Bybit long TE activation must be above stop loss.'
    }
    if (normalizedTakeProfit !== null && normalizedTakeProfit <= activationPrice) {
      return 'Bybit long TE take profit must be above activation.'
    }
  } else {
    if (activationPrice >= stopLoss) {
      return 'Bybit short TE activation must be below stop loss.'
    }
    if (normalizedTakeProfit !== null && normalizedTakeProfit >= activationPrice) {
      return 'Bybit short TE take profit must be below activation.'
    }
  }

  return null
}
