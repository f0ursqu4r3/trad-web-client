import type { NativeProtectionProjection, NativeProtectionStatus } from '../gateway/index.ts'

// Routine waits the engine keeps as reconciliation, shown as work in
// progress (backend `projection/confirmation.rs`, 2026-10-29).
//
// A cancel that raced a fill keeps its order ReconciliationRequired until
// the exact cancel-outcome query answers, usually within tens of
// milliseconds; the order, Chase and close rows then carry
// `confirming_cancel` and their commands are already `running`. A protection
// flagged only because a fill shrank the trade before a sibling was
// resized, with the resize in flight, carries `resizing_after_fill`. Once
// either wait fails (the query spends its attempts, no resize is left) the
// flag goes and the row shows reconciliation required as before.

export const CONFIRMING_CANCEL = 'confirming_cancel'

interface LifecycleRow {
  lifecycle: string
  confirming_cancel?: boolean
}

interface ReconcilableOrder {
  reconciliation_required: boolean
  confirming_cancel?: boolean
}

export function presentedLifecycle(row: LifecycleRow): string {
  return row.confirming_cancel === true ? CONFIRMING_CANCEL : row.lifecycle
}

export function orderNeedsReconciliation(order: ReconcilableOrder): boolean {
  return order.reconciliation_required && order.confirming_cancel !== true
}

export function confirmingCancel(orders: ReadonlyArray<{ confirming_cancel?: boolean }>): boolean {
  return orders.some((order) => order.confirming_cancel === true)
}

export function presentedProtectionStatus(
  protection: Pick<NativeProtectionProjection, 'status' | 'resizing_after_fill'>,
): NativeProtectionStatus {
  return protection.resizing_after_fill === true ? 'resizing' : protection.status
}
