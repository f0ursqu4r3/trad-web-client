import type { FeeTotalProjection, TradeFeesProjection } from '../gateway/index.ts'
import { addExact } from '../exactDecimalMath.ts'

// The fees the venue actually charged on one trade, by leg and asset, each
// split into the exchange fee and Trad's builder fee. Planning estimates
// (risk at stop) are a different thing and live with the risk figures.

export interface FeeLeg {
  exchange: Map<string, string>
  builder: Map<string, string>
}

export interface TradeFeeSummary {
  entry: FeeLeg
  exit: FeeLeg
  total: Map<string, string>
  // Why the totals are approximate, or null when they are exact.
  approximateReason: string | null
}

export function tradeFeeSummary(fees: TradeFeesProjection | undefined): TradeFeeSummary | null {
  if (fees === undefined) return null
  const entry = feeLeg(fees.entry)
  const exit = feeLeg(fees.exit)
  const total = new Map<string, string>()
  for (const leg of [entry, exit]) {
    for (const values of [leg.exchange, leg.builder]) {
      for (const [asset, value] of values)
        total.set(asset, addExact(total.get(asset) ?? '0', value))
    }
  }
  return { entry, exit, total, approximateReason: approximateReason(fees) }
}

function feeLeg(rows: FeeTotalProjection[]): FeeLeg {
  const leg: FeeLeg = { exchange: new Map(), builder: new Map() }
  for (const row of rows) {
    leg.exchange.set(row.asset, addExact(leg.exchange.get(row.asset) ?? '0', row.exchange_fee))
    leg.builder.set(row.asset, addExact(leg.builder.get(row.asset) ?? '0', row.builder_fee))
  }
  return leg
}

function approximateReason(fees: TradeFeesProjection): string | null {
  const reasons: string[] = []
  if (fees.fills_without_fee > 0) {
    reasons.push(
      fees.fills_without_fee === 1
        ? 'One fill arrived without a reported fee and is not counted.'
        : `${fees.fills_without_fee} fills arrived without a reported fee and are not counted.`,
    )
  }
  if (fees.apportioned) {
    reasons.push(
      'A close was shared with other trades or outside units; its fee is split by quantity.',
    )
  }
  return reasons.length === 0 ? null : reasons.join(' ')
}
