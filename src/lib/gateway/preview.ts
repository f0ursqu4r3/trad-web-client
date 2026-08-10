import type {
  ExactDecimal,
  PlaceChaseIntent,
  PlaceOrderIntent,
  PlaceTrailingEntryIntent,
  PositionSideIntent,
} from './intent.ts'

export type BrowserPreviewIntent =
  | { kind: 'place_order'; parameters: PlaceOrderIntent }
  | { kind: 'place_chase'; parameters: PlaceChaseIntent }
  | { kind: 'place_trailing_entry'; parameters: PlaceTrailingEntryIntent }

export type PreviewKind = 'order' | 'chase' | 'trailing_entry'
export type PreviewPriceSource = 'best_bid' | 'best_ask' | 'limit' | 'trailing_entry_reference'

export interface ExecutionChildPreview {
  base_quantity: ExactDecimal
  quote_notional: ExactDecimal
}

export type PriceRulePreview =
  | { kind: 'fixed_tick'; tick: ExactDecimal }
  | { kind: 'hyperliquid_perpetual'; size_decimals: number }

export interface InstrumentRulePreview {
  price: PriceRulePreview
  quantity_step: ExactDecimal
  minimum_order_quantity: ExactDecimal
  maximum_order_quantity: ExactDecimal | null
  minimum_order_notional: ExactDecimal | null
  observed_at_ms: number
}

export interface CommandPreview {
  kind: PreviewKind
  symbol: string
  position_side: PositionSideIntent
  decision_price: ExactDecimal
  price_source: PreviewPriceSource
  market_observed_at_ms: number | null
  raw_base_quantity: ExactDecimal
  normalized_base_quantity: ExactDecimal
  normalized_quote_notional: ExactDecimal
  children: ExecutionChildPreview[]
  instrument: InstrumentRulePreview
  warnings: string[]
}

export type BrowserPreviewOutcome =
  | { kind: 'ready'; preview: CommandPreview }
  | {
      kind: 'rejected'
      rejection: {
        code:
          | 'invalid_intent'
          | 'unauthorized'
          | 'account_unavailable'
          | 'routing_changed'
          | 'planning_failed'
        reason: string
        retryable: boolean
      }
    }
