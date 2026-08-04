import type {
  ChaseBoundary,
  HyperliquidExecutionGuardOverrides,
  LimitTimeInForce,
  MarketAction,
  OneWayOpenSemantics,
  OrderQuantityMode,
  PositionSide,
  TakeProfitLadder,
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
  take_profit_ladder?: TakeProfitLadder | null
  stop_loss?: number | null
  execution_guard_overrides?: HyperliquidExecutionGuardOverrides | null
  builder_target_total_tenths_bps?: number | null
}

export type TrailingEntryPrefill = {
  account_id?: string | null
  activation_price?: number
  jump_frac_threshold?: number
  position_side?: PositionSide
  risk_amount?: number
  stop_loss?: number
  take_profit?: number | null
  symbol?: string
  one_way_open_semantics?: OneWayOpenSemantics
  builder_target_total_tenths_bps?: number | null
}

export type MarketOrderPrefill = {
  account_id?: string | null
  symbol: string
  quantity?: number
  quantity_usd?: number
  quantity_mode?: OrderQuantityMode
  position_side: PositionSide
  action: MarketAction
  take_profit?: number | null
  take_profit_ladder?: TakeProfitLadder | null
  stop_loss?: number | null
  builder_target_total_tenths_bps?: number | null
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
  take_profit_ladder?: TakeProfitLadder | null
  stop_loss?: number | null
  builder_target_total_tenths_bps?: number | null
}
