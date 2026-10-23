import { decodeTradeSummaries, type TradeSummary } from '../gateway/tradeSummary.ts'

// The server's trade summaries for one account view, by trade id (exposure
// scope id). null: the gateway sent none, so it does not produce them yet.
// Maps are replaced, never edited, so a view stays immutable.
export type TradeSummaryIndex = ReadonlyMap<string, TradeSummary> | null

export function snapshotTradeSummaries(value: unknown): TradeSummaryIndex {
  if (!Array.isArray(value)) return null
  return new Map(decodeTradeSummaries(value).map((summary) => [summary.trade_id, summary]))
}

// Upserts replace by trade id, then removals drop; unchanged when the delta
// carries neither. A delta before any snapshot summary starts an index.
export function applyTradeSummaryChanges(
  index: TradeSummaryIndex,
  upserts: unknown,
  removed: unknown,
): TradeSummaryIndex {
  const changed = decodeTradeSummaries(upserts)
  const gone = Array.isArray(removed)
    ? removed.filter((id): id is string => typeof id === 'string')
    : []
  if (changed.length === 0 && gone.length === 0) return index
  const next = new Map(index ?? [])
  for (const summary of changed) next.set(summary.trade_id, summary)
  for (const id of gone) next.delete(id)
  return next
}
