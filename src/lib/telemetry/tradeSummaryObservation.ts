import type { PositionProjection } from '../gateway/index.ts'
import type { TradeSummary } from '../gateway/tradeSummary.ts'
import {
  canonicalJson,
  compareTradeWithSummary,
  type TradeSummaryDifference,
} from '../projection/tradeSummaryShadow.ts'
import type { ManagedTradeView } from '../projection/tradeWorkspaceTypes.ts'
import type { TelemetryRecord } from './contract.ts'

// Trade-summary shadow telemetry (slice S2). Card values are financial, so
// they never leave the browser: a mismatch names the field and carries two
// short digests salted per session (equal digests mean equal values within
// one session; they cannot be reversed or joined across sessions). The trade
// id, account and projection revision let support recompute both sides from
// durable data.
//
// - trade_summary_mismatch: at most once per trade and field per session,
//   and at most MAX_MISMATCH_EVENTS per session.
// - trade_summary_shadow_measured: counts from the latest full comparison,
//   after the first one and then at most once per MEASURE_WINDOW_MS.

export const MEASURE_WINDOW_MS = 60_000
// Every card is compared again this often; in between only cards whose
// summary changed or that are new.
export const FULL_SWEEP_MS = 30_000
const MAX_MISMATCH_EVENTS = 50
// A quiet tab can go long between comparisons; the window reports at most a day.
const MAX_WINDOW_MS = 86_400_000
const DIGEST_HEX_LENGTH = 16

export type MismatchKind = 'different' | 'missing_on_client' | 'missing_on_server'

export interface ShadowInput {
  accountId: string
  projectionRevision: number
  trades: ManagedTradeView[]
  summaries: ReadonlyMap<string, TradeSummary>
  positions: PositionProjection[]
  blockedSymbols: Record<string, string> | undefined
}

interface Sweep {
  cards: number
  matched: number
  mismatched: number
  missingSummary: number
  orphanSummary: number
}

export class TradeSummaryShadow {
  private readonly now: () => number
  private readonly record: (record: TelemetryRecord) => void
  private readonly digest: (text: string) => Promise<string>
  private accountId: string | null = null
  private lastSweepAt = -Infinity
  private lastEmitAt: number | null = null
  private windowStartedAt: number | null = null
  private comparisons = 0
  private latestSweep: Sweep | null = null
  private readonly compared = new Map<string, TradeSummary>()
  private readonly reported = new Set<string>()
  private mismatchEvents = 0

  constructor(
    now: () => number,
    record: (record: TelemetryRecord) => void,
    digest: (text: string) => Promise<string>,
  ) {
    this.now = now
    this.record = record
    this.digest = digest
  }

  compare(input: ShadowInput): void {
    const now = this.now()
    if (input.accountId !== this.accountId) {
      this.accountId = input.accountId
      this.compared.clear()
      this.lastSweepAt = -Infinity
    }
    this.windowStartedAt ??= now
    const sweep = now - this.lastSweepAt >= FULL_SWEEP_MS
    const counts: Sweep = {
      cards: 0,
      matched: 0,
      mismatched: 0,
      missingSummary: 0,
      orphanSummary: 0,
    }
    const cardIds = new Set<string>()
    for (const trade of input.trades) {
      cardIds.add(trade.scopeId)
      const summary = input.summaries.get(trade.scopeId)
      counts.cards += 1
      if (summary === undefined) {
        counts.missingSummary += 1
        continue
      }
      if (!sweep && this.compared.get(trade.scopeId) === summary) continue
      this.compared.set(trade.scopeId, summary)
      this.comparisons += 1
      const differences = compareTradeWithSummary(
        trade,
        summary,
        input.blockedSymbols?.[trade.symbol] ?? null,
        input.positions,
      )
      if (differences.length === 0) counts.matched += 1
      else counts.mismatched += 1
      for (const difference of differences) {
        this.reportMismatch(input, trade.scopeId, summary.revision, difference)
      }
    }
    if (sweep) {
      for (const tradeId of input.summaries.keys()) {
        if (!cardIds.has(tradeId)) counts.orphanSummary += 1
      }
      this.lastSweepAt = now
      this.latestSweep = counts
    }
    if (this.lastEmitAt === null || now - this.lastEmitAt >= MEASURE_WINDOW_MS) this.emit(now)
  }

  private reportMismatch(
    input: ShadowInput,
    tradeId: string,
    summaryRevision: number,
    difference: TradeSummaryDifference,
  ): void {
    const key = `${tradeId}:${difference.field}`
    if (this.reported.has(key) || this.mismatchEvents >= MAX_MISMATCH_EVENTS) return
    this.reported.add(key)
    this.mismatchEvents += 1
    const kind: MismatchKind =
      difference.client === null
        ? 'missing_on_client'
        : difference.server === null
          ? 'missing_on_server'
          : 'different'
    void Promise.all([
      this.digest(canonicalJson(difference.client)),
      this.digest(canonicalJson(difference.server)),
    ])
      .then(([clientDigest, serverDigest]) =>
        this.record({
          eventName: 'trade_summary_mismatch',
          accountId: input.accountId,
          tradeId,
          projectionRevision: input.projectionRevision,
          properties: {
            field_name: difference.field,
            reason_code: kind,
            summary_revision: summaryRevision,
            client_digest: clientDigest,
            server_digest: serverDigest,
          },
        }),
      )
      .catch(() => undefined)
  }

  private emit(now: number): void {
    const sweep = this.latestSweep
    if (sweep === null) return
    this.record({
      eventName: 'trade_summary_shadow_measured',
      ...(this.accountId === null ? {} : { accountId: this.accountId }),
      properties: {
        cards: sweep.cards,
        matched: sweep.matched,
        mismatched: sweep.mismatched,
        missing_summary: sweep.missingSummary,
        orphan_summary: sweep.orphanSummary,
        comparisons: this.comparisons,
        field_mismatches: this.reported.size,
        window_ms: Math.min(
          MAX_WINDOW_MS,
          Math.max(0, Math.round(now - (this.windowStartedAt ?? now))),
        ),
      },
    })
    this.lastEmitAt = now
    this.windowStartedAt = now
    this.comparisons = 0
  }
}

// SHA-256 over a per-session random salt and the value, first 16 hex digits.
export function sessionDigest(): (text: string) => Promise<string> {
  const salt = crypto.randomUUID()
  return async (text) => {
    const bytes = new TextEncoder().encode(`${salt}\n${text}`)
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return [...hash]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, DIGEST_HEX_LENGTH)
  }
}
