import type { AccountProjectionState } from '@/stores/accountProjection'
import type { TradeWorkspaceProjection } from '@/lib/projection/tradeWorkspace'
import { recordTelemetry } from '@/lib/telemetry'
import { sessionDigest, TradeSummaryShadow } from './tradeSummaryObservation.ts'

// Runs the trade-summary shadow comparison off the update path: at most once
// per COMPARE_DELAY_MS, on the cards and summaries current at that moment
// (both come from the same projection view, so they share a revision). It
// never changes what the workspace shows, and nothing it does can throw
// into the page.

const COMPARE_DELAY_MS = 2_000

export interface ShadowSource {
  accountId: string | null
  projection: AccountProjectionState | null
  model: TradeWorkspaceProjection | null
}

const shadow = new TradeSummaryShadow(() => performance.now(), recordTelemetry, sessionDigest())
let read: (() => ShadowSource) | null = null
let timer: number | null = null

export function scheduleTradeSummaryShadow(source: () => ShadowSource): void {
  read = source
  if (timer !== null) return
  timer = window.setTimeout(runShadow, COMPARE_DELAY_MS)
}

function runShadow(): void {
  timer = null
  const source = read
  read = null
  try {
    const current = source?.()
    const view = current?.projection?.view ?? null
    if (
      current === undefined ||
      current.accountId === null ||
      current.model === null ||
      current.projection?.status !== 'ready' ||
      view === null ||
      view.summaries === null
    ) {
      return
    }
    shadow.compare({
      accountId: current.accountId,
      projectionRevision: view.live.checkpoint.projection_revision,
      trades: [...current.model.activeTrades, ...current.model.closedTrades],
      summaries: view.summaries,
      positions: view.live.positions,
      blockedSymbols: view.live.checkpoint.new_risk_blocked_symbols,
    })
  } catch {
    // Observation only.
  }
}
