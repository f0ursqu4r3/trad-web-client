import type { ExecutionFill } from '@/lib/ws/protocol'

export type TokenTotals = Map<string, number>

export type ExecutionEconomics = {
  totalFees: TokenTotals
  builderFees: TokenTotals
  exchangeFees: TokenTotals
  closedPnl: TokenTotals
  netAfterFees: TokenTotals
  hasClosedPnl: boolean
}

function decimal(value?: string | null): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function totalsByToken(fills: ExecutionFill[], field: 'fee' | 'builder_fee' | 'closed_pnl') {
  const totals: TokenTotals = new Map()
  for (const fill of fills) {
    const value = decimal(fill[field])
    if (value == null) continue
    const token = fill.fee_token?.trim() || 'quote'
    totals.set(token, (totals.get(token) ?? 0) + value)
  }
  return totals
}

function subtractTotals(total: TokenTotals, component: TokenTotals): TokenTotals {
  const result = new Map(total)
  for (const [token, value] of component) {
    result.set(token, (result.get(token) ?? 0) - value)
  }
  return result
}

export function executionFillKey(fill: ExecutionFill): string {
  if (fill.execution_id) {
    return `${fill.exchange}:execution:${fill.execution_id}`
  }
  return [
    fill.exchange,
    'order',
    fill.remote_order_id || '-',
    'time',
    fill.execution_time_ms ?? 0,
    'price',
    fill.price || '-',
    'qty',
    fill.quantity || '-',
  ].join(':')
}

export function summarizeExecutionFills(fills: ExecutionFill[]): ExecutionEconomics {
  const totalFees = totalsByToken(fills, 'fee')
  const builderFees = totalsByToken(fills, 'builder_fee')
  const closedPnl = totalsByToken(fills, 'closed_pnl')
  return {
    totalFees,
    builderFees,
    exchangeFees: subtractTotals(totalFees, builderFees),
    closedPnl,
    netAfterFees: subtractTotals(closedPnl, totalFees),
    hasClosedPnl: fills.some((fill) => decimal(fill.closed_pnl) !== null),
  }
}

export function formatTokenTotals(totals: TokenTotals): string {
  if (totals.size === 0) return '-'
  return [...totals.entries()]
    .map(
      ([token, value]) =>
        `${value.toLocaleString(undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 8,
        })} ${token}`,
    )
    .join(', ')
}
