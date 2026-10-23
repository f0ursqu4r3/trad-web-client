import type { PositionProjection } from '../gateway/index.ts'
import {
  TRADE_SUMMARY_FIELDS,
  type TradeSummary,
  type TradeSummaryField,
} from '../gateway/tradeSummary.ts'
import { commandPosition } from './commandFilters.ts'
import type { ManagedTradeView } from './tradeWorkspaceTypes.ts'

export { TRADE_SUMMARY_FIELDS, type TradeSummaryField }

// Shadow comparison for trade-summary slice S2: the card the client builds
// (buildManagedTrade, unchanged) against the server's TradeSummary, field by
// field, per docs/networking-trade-summaries.md section 1. Decimals compare
// as exact strings; nested values as canonical JSON.

export type SummaryValue =
  | null
  | boolean
  | number
  | string
  | SummaryValue[]
  | { [key: string]: SummaryValue }

export interface TradeSummaryDifference {
  field: TradeSummaryField
  client: SummaryValue
  server: SummaryValue
}

// The card's values in the summary's shape. This is the mapping the
// backend's golden generator (tools/golden/trade_summaries.ts) uses, so the
// goldens test here pins the same thing.
export function cardSummaryFields(
  trade: ManagedTradeView,
  positions: PositionProjection[],
): Record<TradeSummaryField, SummaryValue> {
  const finished = trade.lifecycle === 'closed' || trade.lifecycle === 'taken_over'
  const fillTimes = trade.executions.map((row) => row.fill.occurred_at)
  const protection = trade.protection
  return {
    primary_command_id: trade.primaryCommand.command_id,
    primary_kind: trade.primaryCommand.accepted.kind,
    entry_label: trade.entryLabel,
    symbol: trade.symbol,
    side: trade.side,
    created_at: trade.createdAt,
    closed_at: finished && fillTimes.length > 0 ? Math.max(...fillTimes) : null,
    lifecycle: trade.lifecycle,
    attention_reason: trade.attentionReason,
    position_state: commandPosition(trade.primaryCommand, positions),
    awaiting_exchange_confirmation: trade.position?.status === 'awaiting_exchange_confirmation',
    requested_quantity: trade.requestedQuantity,
    filled_quantity: trade.filledQuantity,
    opened_quantity: trade.exposure?.opened_quantity ?? null,
    reduced_quantity: trade.exposure?.reduced_quantity ?? '0',
    remaining_quantity: trade.remainingQuantity,
    average_entry_price: trade.averageEntryPrice,
    pnl_asset: trade.pnlAsset,
    pnl_evidence_complete: trade.pnlEvidenceComplete,
    realized_pnl: assetTotals(trade.realizedPnl),
    venue_realized_pnl: assetTotals(trade.venueRealizedPnl),
    net_after_fees: assetTotals(trade.netAfterFees),
    total_fees: assetTotals(trade.totalFees),
    builder_fees: assetTotals(trade.builderFees),
    fees_by_leg: plain(trade.exposure?.fees ?? null),
    planned_risk: trade.plannedRisk,
    initial_planned_loss: trade.initialPlannedLoss,
    current_stop_exposure: trade.currentStopExposure,
    chase_price_risk: plain(trade.chasePriceRisk),
    pinned_all_in_target_tenths_bps: trade.pinnedAllInTargetTenthsBps,
    pinned_fee_source: trade.pinnedFeeSource,
    pinned_fee_policy_version: trade.pinnedFeePolicyVersion,
    protection:
      protection === null
        ? null
        : {
            protection_id: protection.protection_id,
            scope_id: protection.scope_id,
            status: protection.status,
            failure_reason: protection.failure_reason,
            stop_price:
              protection.plan.children.find((child) => child.protection_kind === 'stop_loss')
                ?.trigger_price ?? null,
            take_profit_prices: protection.plan.children
              .filter((child) => child.protection_kind === 'take_profit')
              .map((child) => child.trigger_price),
            target_quantity: protection.target_quantity,
            covered_quantity: protection.covered_quantity,
          },
    fill_count: trade.executions.length,
    command_count: trade.commands.length,
  }
}

// The summary's values as this card should show them: the coin-level block
// (`coinBlockedReason`, from the checkpoint) is overlaid as section 1.4 says.
export function summaryCardFields(
  summary: TradeSummary,
  coinBlockedReason: string | null,
): Record<TradeSummaryField, SummaryValue> {
  const fields = {} as Record<TradeSummaryField, SummaryValue>
  for (const field of TRADE_SUMMARY_FIELDS) {
    fields[field] = plain((summary as unknown as Record<string, unknown>)[field] ?? null)
  }
  if (coinBlockedReason !== null) {
    fields.attention_reason = coinBlockedReason
    if (summary.coin_block_applies) fields.lifecycle = 'attention'
  }
  return fields
}

export function compareTradeWithSummary(
  trade: ManagedTradeView,
  summary: TradeSummary,
  coinBlockedReason: string | null,
  positions: PositionProjection[],
): TradeSummaryDifference[] {
  const client = cardSummaryFields(trade, positions)
  const server = summaryCardFields(summary, coinBlockedReason)
  const differences: TradeSummaryDifference[] = []
  for (const field of TRADE_SUMMARY_FIELDS) {
    if (canonicalJson(client[field]) !== canonicalJson(server[field])) {
      differences.push({ field, client: client[field], server: server[field] })
    }
  }
  return differences
}

// JSON with sorted keys and no undefined members.
export function canonicalJson(value: SummaryValue): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: SummaryValue): SummaryValue {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key] as SummaryValue)]),
  )
}

function assetTotals(values: Map<string, string>): SummaryValue {
  return [...values.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([asset, amount]) => ({ asset, amount }))
}

// Engine objects the card passes through, as JSON (undefined members drop).
function plain(value: unknown): SummaryValue {
  return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as SummaryValue)
}
