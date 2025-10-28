import type { MarketAction, PositionSide } from '@/lib/ws/protocol'

export type TrailingEntryPrefill = {
  activation_price?: number
  jump_frac_threshold?: number
  position_side?: PositionSide
  risk_amount?: number
  stop_loss?: number
  symbol?: string
}

export type MarketOrderPrefill = {
  symbol: string
  quantity_usd: number
  position_side: PositionSide
  action: MarketAction
}
