import type {
  ChasePriceRiskState,
  NativeProtectionStatus,
  PositionSide,
  TradeFeesProjection,
} from './projection.ts'

// The server's card numbers for one trade (gateway-contracts
// `trade_summary::TradeSummary`; docs/networking-trade-summaries.md in the
// backend repo). Slice S2 sends them alongside the rows the cards are built
// from today; the client only compares them (shadow mode). Decimals are
// strings in exactDecimalMath's canonical form.

export interface TradeSummaryAssetTotal {
  asset: string
  amount: string
}

export interface TradeProtectionSummary {
  protection_id: string
  scope_id: string
  status: NativeProtectionStatus
  failure_reason: string | null
  stop_price: string | null
  take_profit_prices: string[]
  target_quantity: string
  covered_quantity: string
}

export interface TradeSummary {
  // The exposure scope id; the card's tradeId is `scope:<trade_id>`.
  trade_id: string
  // Projection revision of the summary's last change.
  revision: number
  primary_command_id: string
  primary_kind: 'place_order' | 'place_execution_group' | 'place_chase' | 'place_trailing_entry'
  entry_label: string
  symbol: string
  side: PositionSide
  created_at: number
  closed_at: number | null
  // Without the coin-level block; the client overlays it.
  lifecycle: 'entering' | 'active' | 'closing' | 'attention' | 'taken_over' | 'closed'
  coin_block_applies: boolean
  attention_reason: string | null
  position_state: 'open' | 'closed' | 'not_applicable'
  awaiting_exchange_confirmation: boolean
  requested_quantity: string | null
  filled_quantity: string
  opened_quantity: string | null
  reduced_quantity: string
  remaining_quantity: string
  average_entry_price: string | null
  pnl_asset: string | null
  pnl_evidence_complete: boolean
  realized_pnl: TradeSummaryAssetTotal[]
  venue_realized_pnl: TradeSummaryAssetTotal[]
  net_after_fees: TradeSummaryAssetTotal[]
  total_fees: TradeSummaryAssetTotal[]
  builder_fees: TradeSummaryAssetTotal[]
  fees_by_leg: TradeFeesProjection | null
  planned_risk: string | null
  initial_planned_loss: string | null
  current_stop_exposure: string | null
  chase_price_risk: ChasePriceRiskState | null
  pinned_all_in_target_tenths_bps: number | null
  pinned_fee_source: string | null
  pinned_fee_policy_version: number | null
  protection: TradeProtectionSummary | null
  fill_count: number
  command_count: number
}

// Every compared field, named as on the wire. Not compared: trade_id (the
// key), revision (server bookkeeping) and coin_block_applies, which is
// checked through the lifecycle it produces with the coin-level block.
export const TRADE_SUMMARY_FIELDS = [
  'primary_command_id',
  'primary_kind',
  'entry_label',
  'symbol',
  'side',
  'created_at',
  'closed_at',
  'lifecycle',
  'attention_reason',
  'position_state',
  'awaiting_exchange_confirmation',
  'requested_quantity',
  'filled_quantity',
  'opened_quantity',
  'reduced_quantity',
  'remaining_quantity',
  'average_entry_price',
  'pnl_asset',
  'pnl_evidence_complete',
  'realized_pnl',
  'venue_realized_pnl',
  'net_after_fees',
  'total_fees',
  'builder_fees',
  'fees_by_leg',
  'planned_risk',
  'initial_planned_loss',
  'current_stop_exposure',
  'chase_price_risk',
  'pinned_all_in_target_tenths_bps',
  'pinned_fee_source',
  'pinned_fee_policy_version',
  'protection',
  'fill_count',
  'command_count',
] as const

export type TradeSummaryField = (typeof TRADE_SUMMARY_FIELDS)[number]

// Summaries with an id and a revision; anything else is dropped, never
// trusted.
export function decodeTradeSummaries(value: unknown): TradeSummary[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (row): row is TradeSummary =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as TradeSummary).trade_id === 'string' &&
      Number.isSafeInteger((row as TradeSummary).revision),
  )
}
