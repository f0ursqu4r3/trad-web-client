export type ExactDecimal = string
export type Uuid = string

export type PositionSideIntent = 'long' | 'short'
export type TriggerSourceIntent = 'last_price' | 'mark_price' | 'index_price'
export type TimeInForceIntent = 'good_til_canceled' | 'post_only'

export type OrderSizingIntent =
  | { kind: 'base'; quantity: ExactDecimal }
  | { kind: 'quote_notional'; amount: ExactDecimal }
  | { kind: 'risk_at_stop'; loss_amount: ExactDecimal }

export type OrderExecutionIntent =
  | { kind: 'market' }
  | { kind: 'limit'; price: ExactDecimal; time_in_force: TimeInForceIntent }

export type ExecutionShapeIntent =
  | { kind: 'single' }
  | {
      kind: 'split'
      target_child_notional?: ExactDecimal
      max_children: number
    }

export type ProtectionExecutionIntent = { kind: 'market' } | { kind: 'limit'; price: ExactDecimal }

export type TakeProfitAllocationIntent =
  | { kind: 'full_remaining' }
  | { kind: 'fraction'; fraction: ExactDecimal }
  | { kind: 'exact_base'; quantity: ExactDecimal }

export interface TakeProfitIntent {
  trigger_price: ExactDecimal
  trigger_source: TriggerSourceIntent
  execution: ProtectionExecutionIntent
  allocation: TakeProfitAllocationIntent
}

export interface StopLossIntent {
  trigger_price: ExactDecimal
  trigger_source: TriggerSourceIntent
  execution: ProtectionExecutionIntent
}

export interface ProtectionIntent {
  take_profits: TakeProfitIntent[]
  stop_loss?: StopLossIntent
}

export interface ProtectionTakeProfitAmendmentIntent extends TakeProfitIntent {
  child_id?: Uuid
}

export interface ProtectionStopLossAmendmentIntent extends StopLossIntent {
  child_id?: Uuid
}

export interface AmendProtectionIntent {
  protection_id: Uuid
  expected_plan_revision: number
  take_profits: ProtectionTakeProfitAmendmentIntent[]
  stop_loss?: ProtectionStopLossAmendmentIntent
}

export interface PlaceOrderIntent {
  symbol: string
  position_side: PositionSideIntent
  sizing: OrderSizingIntent
  execution: OrderExecutionIntent
  protection?: ProtectionIntent
  shape: ExecutionShapeIntent
}

export type ChaseBoundaryIntent =
  | { kind: 'price'; value: ExactDecimal }
  | { kind: 'basis_points'; value: ExactDecimal }

export interface PlaceChaseIntent {
  symbol: string
  position_side: PositionSideIntent
  sizing: OrderSizingIntent
  protection?: ProtectionIntent
  adverse_boundary?: ChaseBoundaryIntent
  expires_after_ms?: number
  remainder: 'cancel' | 'market_fill'
}

export interface PlaceTrailingEntryIntent {
  symbol: string
  position_side: PositionSideIntent
  activation_price: ExactDecimal
  jump_basis_points: ExactDecimal
  stop_loss_price: ExactDecimal
  take_profit_price?: ExactDecimal
  risk_amount: ExactDecimal
  shape: ExecutionShapeIntent
  one_way_semantics: 'delta' | 'target_side_exposure'
}

export interface TrailingEntryExpectedIntent {
  state_revision: number
  phase: string
  lifecycle: string
}

export type TakeProfitAmendmentIntent = { kind: 'set'; price: ExactDecimal } | { kind: 'clear' }

export interface AmendTrailingEntryIntent {
  trailing_entry_id: Uuid
  expected: TrailingEntryExpectedIntent
  activation_price?: ExactDecimal
  jump_basis_points?: ExactDecimal
  stop_loss_price?: ExactDecimal
  take_profit?: TakeProfitAmendmentIntent
  risk_amount?: ExactDecimal
  shape?: ExecutionShapeIntent
}

export interface TrailingEntryImmediateIntent {
  trailing_entry_id: Uuid
  expected: TrailingEntryExpectedIntent
}

export interface ModifyOrderIntent {
  order_id: Uuid
  target_price: ExactDecimal
  target_base_quantity: ExactDecimal
}

export type CloseQuantityIntent =
  | { kind: 'full' }
  | { kind: 'base'; quantity: ExactDecimal }
  | { kind: 'percent'; percent: ExactDecimal }

export type CloseExecutionIntent =
  | { kind: 'market' }
  | { kind: 'limit'; price: ExactDecimal; time_in_force: TimeInForceIntent }
  | {
      kind: 'chase'
      adverse_boundary?: ChaseBoundaryIntent
      expires_after_ms?: number
    }

export type FlattenTargetIntent = { kind: 'symbol'; symbol: string } | { kind: 'account' }
export type CancelEntryWorkTargetIntent = FlattenTargetIntent
export type MarginModeIntent = 'cross' | 'isolated'
export type PositionModeIntent = 'hedge' | 'one_way'

export interface SetLeverageIntent {
  symbol: string
  leverage: number
  margin_mode?: MarginModeIntent
}

export type BrowserCommandIntent =
  | { kind: 'place_order'; parameters: PlaceOrderIntent }
  | { kind: 'place_chase'; parameters: PlaceChaseIntent }
  | { kind: 'place_trailing_entry'; parameters: PlaceTrailingEntryIntent }
  | { kind: 'amend_trailing_entry'; parameters: AmendTrailingEntryIntent }
  | { kind: 'activate_trailing_entry'; parameters: TrailingEntryImmediateIntent }
  | { kind: 'enter_trailing_entry'; parameters: TrailingEntryImmediateIntent }
  | { kind: 'modify_order'; parameters: ModifyOrderIntent }
  | { kind: 'cancel_order'; parameters: { order_id: Uuid } }
  | { kind: 'cancel_chase'; parameters: { chase_id: Uuid } }
  | { kind: 'cancel_trailing_entry'; parameters: { trailing_entry_id: Uuid } }
  | { kind: 'continue_trailing_entry'; parameters: { trailing_entry_id: Uuid } }
  | {
      kind: 'close_exposure'
      parameters: {
        source_command_id: Uuid
        quantity: CloseQuantityIntent
        execution: CloseExecutionIntent
      }
    }
  | { kind: 'close_trailing_entry'; parameters: { trailing_entry_id: Uuid } }
  | { kind: 'cancel_entry_work'; parameters: { target: CancelEntryWorkTargetIntent } }
  | { kind: 'take_over_exposure'; parameters: { source_command_id: Uuid } }
  | { kind: 'flatten'; parameters: { target: FlattenTargetIntent } }
  | { kind: 'set_leverage'; parameters: SetLeverageIntent }
  | { kind: 'set_position_mode'; parameters: { mode: PositionModeIntent } }
  | { kind: 'amend_protection'; parameters: AmendProtectionIntent }
