import type { ChaseProjection } from '../gateway/index.ts'
import { isExactZero } from '../exactDecimalMath.ts'
import { confirmingCancel, presentedProtectionStatus } from './confirmation.ts'
import type { ManagedTradeView } from './tradeWorkspaceTypes.ts'

// The one-line progress a trade card shows while Trad works on it.
export function tradeProgressMessage(
  trade: Pick<
    ManagedTradeView,
    'lifecycle' | 'remainingQuantity' | 'protection' | 'position' | 'orders'
  >,
  entryChase: ChaseProjection | null,
): string | null {
  const protection = trade.protection
  if (trade.lifecycle === 'closing' && isExactZero(trade.remainingQuantity) && protection) {
    if (presentedProtectionStatus(protection) === 'reconciliation_required') {
      return 'Position closed · verifying protection cleanup'
    }
    if (protection.status !== 'canceled') return 'Position closed · canceling protection'
  }
  if (entryChase?.market_fill_pending) {
    const ended =
      entryChase.lifecycle === 'boundary_reached'
        ? 'Chase reached its boundary'
        : entryChase.lifecycle === 'expired'
          ? 'Chase timed out'
          : 'Chase is ending'
    const reason = entryChase.last_reason
    return `${ended} · sending the unfilled rest at market${reason ? ` · ${reason}` : ''}`
  }
  if (trade.position?.status === 'awaiting_exchange_confirmation') {
    return 'Confirming the latest position change with the exchange'
  }
  // A cancel that raced a fill, until the exact query answers.
  if (confirmingCancel(trade.orders)) return 'Confirming a Chase cancel with the exchange'
  if (protection?.resizing_after_fill) return 'Resizing protection to the latest fill'
  return null
}
