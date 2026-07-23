import type {
  ChaseBoundary,
  HyperliquidExecutionGuardOverrides,
  LimitTimeInForce,
  MarketAction,
  OrderQuantityMode,
  PositionSide,
} from '@/lib/ws/protocol'

export type ChaseOrderPrefill = {
  account_id?: string | null
  symbol: string
  action: MarketAction
  position_side: PositionSide
  quantity: number
  quantity_mode: OrderQuantityMode
  boundary: ChaseBoundary
  expires_after_secs?: number | null
  take_profit?: number | null
  stop_loss?: number | null
  execution_guard_overrides?: HyperliquidExecutionGuardOverrides | null
}

export type TrailingEntryPrefill = {
  activation_price?: number
  jump_frac_threshold?: number
  position_side?: PositionSide
  risk_amount?: number
  stop_loss?: number
  take_profit?: number | null
  symbol?: string
}

export type MarketOrderPrefill = {
  symbol: string
  quantity_usd: number
  position_side: PositionSide
  action: MarketAction
  take_profit?: number | null
  stop_loss?: number | null
}

export type LimitOrderPrefill = {
  account_id?: string | null
  symbol: string
  action: MarketAction
  position_side: PositionSide
  quantity: number
  quantity_mode: OrderQuantityMode
  price: number
  time_in_force: LimitTimeInForce
  take_profit?: number | null
  stop_loss?: number | null
}
