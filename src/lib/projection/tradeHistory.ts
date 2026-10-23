import { compareExact, formatExactDecimal, isExactZero, sumExact } from '../exactDecimalMath.ts'
import type { TradeFillRole } from '../gateway/historyPages.ts'
import type { TradeSummary } from '../gateway/tradeSummary.ts'
import type { TradeSummaryIndex } from './tradeSummaries.ts'
import type { ManagedTradeView } from './tradeWorkspaceTypes.ts'

// Older closed trades paged over HTTP (slice S3), next to the live cards.
// The cards still come from the live projection; these rows are the
// server's summaries of trades the cards do not show.

// The paged summaries no card shows, in page order. A summary the socket
// brought later (a newer revision) replaces the paged copy.
export function pagedClosedTrades(
  paged: readonly TradeSummary[],
  cardScopeIds: ReadonlySet<string>,
  live: TradeSummaryIndex,
): TradeSummary[] {
  const rows: TradeSummary[] = []
  for (const summary of paged) {
    if (cardScopeIds.has(summary.trade_id)) continue
    const newer = live?.get(summary.trade_id)
    rows.push(newer !== undefined && newer.revision > summary.revision ? newer : summary)
  }
  return rows
}

// The workspace search over a summary's own fields.
export function summaryMatches(summary: TradeSummary, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return true
  return [
    summary.symbol,
    summary.side,
    summary.entry_label,
    summary.lifecycle,
    summary.trade_id,
    `scope:${summary.trade_id}`,
    summary.primary_command_id,
  ].some((value) => value.toLowerCase().includes(normalized))
}

export interface SummaryNet {
  label: string
  tone: 'gain' | 'loss' | 'flat' | 'unknown'
  title: string
}

// Final net after fees, never estimated: a takeover or missing exit fills
// say so instead of showing a number.
export function summaryNet(summary: TradeSummary): SummaryNet {
  if (!summary.pnl_evidence_complete || summary.pnl_asset === null) {
    return summary.lifecycle === 'taken_over'
      ? {
          label: 'unknown after takeover',
          tone: 'unknown',
          title:
            'Trad stopped managing this trade at Take Over; complete attributed exit fills are needed for final P&L',
        }
      : {
          label: 'incomplete',
          tone: 'unknown',
          title: 'Closing-fill evidence is incomplete; P&L is not estimated from fees alone',
        }
  }
  const asset = summary.pnl_asset
  const value = summary.net_after_fees.find((row) => row.asset === asset)?.amount ?? null
  if (value === null) {
    return { label: '-', tone: 'unknown', title: 'No net after fees was recorded' }
  }
  const sign = compareExact(value, '0')
  const formatted = formatExactDecimal(value)
  return {
    label: `${sign > 0 ? '+' : ''}${formatted} ${asset}`,
    tone: sign > 0 ? 'gain' : sign < 0 ? 'loss' : 'flat',
    title: `Final net after fees: ${formatted} ${asset}`,
  }
}

// Whether a live card's fills are not all in the snapshot: the server
// counts more than the card holds, or outside activity reduced or took over
// the trade (manual fills explain that and only the fills route has them).
export function tradeFillsIncomplete(
  trade: ManagedTradeView,
  summary: TradeSummary | null,
): boolean {
  if (summary !== null && summary.fill_count > trade.executions.length) return true
  if (trade.lifecycle === 'taken_over' || summary?.lifecycle === 'taken_over') return true
  const reduced = summary?.reduced_quantity ?? trade.exposure?.reduced_quantity ?? '0'
  if (isExactZero(reduced)) return false
  const entryOrders = new Set(trade.entryOrders.map((order) => order.order_id))
  const ownReduced = sumExact(
    trade.executions
      .filter((row) => row.order === null || !entryOrders.has(row.order.order_id))
      .map((row) => row.fill.quantity),
  )
  return compareExact(reduced, ownReduced) > 0
}

export const FILL_ROLE_LABELS: Record<TradeFillRole, string> = {
  entry: 'entry fill',
  close: 'close fill',
  protection: 'protection fill',
  manual: 'manual fill',
}
