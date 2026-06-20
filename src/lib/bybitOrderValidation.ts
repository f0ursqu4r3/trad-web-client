import { PositionSide } from '@/lib/ws/protocol'

type OptionalPrice = number | null | ''

export function normalizeBybitUsdtSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase()
  return upper.endsWith('USDT') ? upper : `${upper}USDT`
}

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

export function bybitMarketOrderExitLevelError(
  positionSide: PositionSide,
  takeProfit: OptionalPrice,
  stopLoss: OptionalPrice,
): string | null {
  const normalizedTakeProfit = normalizeOptionalPrice(takeProfit)
  const normalizedStopLoss = normalizeOptionalPrice(stopLoss)

  if (normalizedTakeProfit !== null && !positiveFinite(normalizedTakeProfit)) {
    return 'Bybit market take profit must be positive.'
  }
  if (normalizedStopLoss !== null && !positiveFinite(normalizedStopLoss)) {
    return 'Bybit market stop loss must be positive.'
  }
  if (normalizedTakeProfit === null || normalizedStopLoss === null) return null

  if (positionSide === PositionSide.Long && normalizedTakeProfit <= normalizedStopLoss) {
    return 'Bybit long market take profit must be above stop loss.'
  }
  if (positionSide === PositionSide.Short && normalizedTakeProfit >= normalizedStopLoss) {
    return 'Bybit short market take profit must be below stop loss.'
  }

  return null
}
