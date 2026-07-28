import { PositionSide } from '@/lib/ws/protocol'

type OptionalPrice = number | null | ''

export function normalizeBybitUsdtSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase()
  if (!upper || upper === 'USDT') return ''
  return upper.endsWith('USDT') ? upper : `${upper}USDT`
}

export function isValidBybitUsdtSymbol(symbol: string): boolean {
  return normalizeBybitUsdtSymbol(symbol) !== ''
}

export function normalizeHyperliquidPerpSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase()
  if (!upper || upper === 'USDT' || upper === 'USDC') return ''
  if (upper.endsWith('USDT')) return upper.slice(0, -4)
  if (upper.endsWith('USDC')) return upper.slice(0, -4)
  return upper
}

export function isValidHyperliquidPerpSymbol(symbol: string): boolean {
  return normalizeHyperliquidPerpSymbol(symbol) !== ''
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
  return trailingEntryExitLevelError('Bybit', positionSide, activationPrice, stopLoss, takeProfit)
}

export function trailingEntryExitLevelError(
  exchangeLabel: string,
  positionSide: PositionSide,
  activationPrice: number | null,
  stopLoss: number | null,
  takeProfit: OptionalPrice,
): string | null {
  if (activationPrice === null || stopLoss === null) return null
  if (!positiveFinite(activationPrice))
    return `${exchangeLabel} TE activation price must be positive.`
  if (!positiveFinite(stopLoss)) return `${exchangeLabel} TE stop loss must be positive.`

  const normalizedTakeProfit = normalizeOptionalPrice(takeProfit)
  if (normalizedTakeProfit !== null && !positiveFinite(normalizedTakeProfit)) {
    return `${exchangeLabel} TE take profit must be positive.`
  }

  if (positionSide === PositionSide.Long) {
    if (activationPrice <= stopLoss) {
      return `${exchangeLabel} long TE activation must be above stop loss.`
    }
    if (normalizedTakeProfit !== null && normalizedTakeProfit <= activationPrice) {
      return `${exchangeLabel} long TE take profit must be above activation.`
    }
  } else {
    if (activationPrice >= stopLoss) {
      return `${exchangeLabel} short TE activation must be below stop loss.`
    }
    if (normalizedTakeProfit !== null && normalizedTakeProfit >= activationPrice) {
      return `${exchangeLabel} short TE take profit must be below activation.`
    }
  }

  return null
}

export function bybitMarketOrderExitLevelError(
  positionSide: PositionSide,
  takeProfit: OptionalPrice,
  stopLoss: OptionalPrice,
): string | null {
  return marketOrderExitLevelError('Bybit', positionSide, takeProfit, stopLoss)
}

export function marketOrderExitLevelError(
  exchangeLabel: string,
  positionSide: PositionSide,
  takeProfit: OptionalPrice,
  stopLoss: OptionalPrice,
  currentPrice: number | null = null,
): string | null {
  const normalizedTakeProfit = normalizeOptionalPrice(takeProfit)
  const normalizedStopLoss = normalizeOptionalPrice(stopLoss)

  if (normalizedTakeProfit !== null && !positiveFinite(normalizedTakeProfit)) {
    return `${exchangeLabel} market take profit must be positive.`
  }
  if (normalizedStopLoss !== null && !positiveFinite(normalizedStopLoss)) {
    return `${exchangeLabel} market stop loss must be positive.`
  }
  if (currentPrice !== null && positiveFinite(currentPrice)) {
    if (
      normalizedTakeProfit !== null &&
      (positionSide === PositionSide.Long
        ? normalizedTakeProfit <= currentPrice
        : normalizedTakeProfit >= currentPrice)
    ) {
      return `${exchangeLabel} ${positionSide.toLowerCase()} market take profit must be ${positionSide === PositionSide.Long ? 'above' : 'below'} current midpoint ${currentPrice}.`
    }
    if (
      normalizedStopLoss !== null &&
      (positionSide === PositionSide.Long
        ? normalizedStopLoss >= currentPrice
        : normalizedStopLoss <= currentPrice)
    ) {
      return `${exchangeLabel} ${positionSide.toLowerCase()} market stop loss must be ${positionSide === PositionSide.Long ? 'below' : 'above'} current midpoint ${currentPrice}.`
    }
  }

  if (normalizedTakeProfit === null || normalizedStopLoss === null) return null

  if (positionSide === PositionSide.Long && normalizedTakeProfit <= normalizedStopLoss) {
    return `${exchangeLabel} long market take profit must be above stop loss.`
  }
  if (positionSide === PositionSide.Short && normalizedTakeProfit >= normalizedStopLoss) {
    return `${exchangeLabel} short market take profit must be below stop loss.`
  }

  return null
}
