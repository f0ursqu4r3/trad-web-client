import type {
  HyperliquidExecutionGuardOverrides,
  HyperliquidExecutionGuards,
} from '@/lib/ws/protocol'

// 0.1% entry and 3% stop since v0.10.27 (0.5% and 10% before). An account
// keeps the values stored in its metadata; these fill only what is missing.
export const HYPERLIQUID_DEFAULT_EXECUTION_GUARDS: HyperliquidExecutionGuards = {
  entry_market_tenths_bps: 100,
  take_profit_market_tenths_bps: 1000,
  stop_loss_market_tenths_bps: 3000,
}

export const HYPERLIQUID_MAX_EXECUTION_GUARD_TENTHS_BPS = 50000

export function tenthsBpsToPercent(value: number): number {
  return value / 1000
}

export function percentToTenthsBps(value: number): number {
  return Math.round(value * 1000)
}

export function isValidExecutionGuardPercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 50
}

export function resolveHyperliquidExecutionGuards(
  metadata?: {
    entry_market_guard_tenths_bps?: number | null
    take_profit_market_guard_tenths_bps?: number | null
    stop_loss_market_guard_tenths_bps?: number | null
  } | null,
): HyperliquidExecutionGuards {
  return {
    entry_market_tenths_bps:
      metadata?.entry_market_guard_tenths_bps ??
      HYPERLIQUID_DEFAULT_EXECUTION_GUARDS.entry_market_tenths_bps,
    take_profit_market_tenths_bps:
      metadata?.take_profit_market_guard_tenths_bps ??
      HYPERLIQUID_DEFAULT_EXECUTION_GUARDS.take_profit_market_tenths_bps,
    stop_loss_market_tenths_bps:
      metadata?.stop_loss_market_guard_tenths_bps ??
      HYPERLIQUID_DEFAULT_EXECUTION_GUARDS.stop_loss_market_tenths_bps,
  }
}

export function executionGuardOverridesFromPercent(params: {
  entry?: number
  takeProfit?: number
  stopLoss?: number
}): HyperliquidExecutionGuardOverrides {
  return {
    entry_market_tenths_bps: params.entry === undefined ? null : percentToTenthsBps(params.entry),
    take_profit_market_tenths_bps:
      params.takeProfit === undefined ? null : percentToTenthsBps(params.takeProfit),
    stop_loss_market_tenths_bps:
      params.stopLoss === undefined ? null : percentToTenthsBps(params.stopLoss),
  }
}

export function formatExecutionGuardPercent(tenthsBps: number): string {
  return `${tenthsBpsToPercent(tenthsBps).toFixed(3)}%`
}
