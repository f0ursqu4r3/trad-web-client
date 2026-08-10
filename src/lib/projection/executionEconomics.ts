import type { AssetAmountProjection, ExactDecimal, ExecutionProjection } from '../gateway/index.ts'
import { addExact, subtractExact } from '../exactDecimalMath.ts'

export type ExactAssetTotals = Map<string, ExactDecimal>

export interface ProjectionExecutionEconomics {
  totalFees: ExactAssetTotals
  builderFees: ExactAssetTotals
  exchangeFees: ExactAssetTotals
  realizedPnl: ExactAssetTotals
  netAfterFees: ExactAssetTotals
}

export function summarizeProjectionExecutions(
  executions: ExecutionProjection[],
): ProjectionExecutionEconomics {
  const totalFees = totals(executions, (row) => row.fill.fee)
  const builderFees = totals(executions, (row) => row.fill.builder_fee)
  const realizedPnl = totals(executions, (row) => row.fill.realized_pnl)
  return {
    totalFees,
    builderFees,
    exchangeFees: subtractTotals(totalFees, builderFees),
    realizedPnl,
    netAfterFees: subtractTotals(realizedPnl, totalFees),
  }
}

export function formatExactAssetTotals(values: ExactAssetTotals): string {
  if (values.size === 0) return '-'
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([asset, amount]) => `${amount} ${asset}`)
    .join(', ')
}

function totals(
  executions: ExecutionProjection[],
  select: (execution: ExecutionProjection) => AssetAmountProjection | null,
): ExactAssetTotals {
  const values: ExactAssetTotals = new Map()
  for (const execution of executions) {
    const amount = select(execution)
    if (amount === null) continue
    values.set(amount.asset, addExact(values.get(amount.asset) ?? '0', amount.amount))
  }
  return values
}

function subtractTotals(total: ExactAssetTotals, component: ExactAssetTotals): ExactAssetTotals {
  const result = new Map(total)
  for (const [asset, value] of component) {
    result.set(asset, subtractExact(result.get(asset) ?? '0', value))
  }
  return result
}
