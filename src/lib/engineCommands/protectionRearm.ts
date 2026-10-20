import type {
  BrowserCommandIntent,
  NativeProtectionChildPlan,
  NativeProtectionProjection,
} from '../gateway/index.ts'
import { isExactZero } from '../exactDecimalMath.ts'
import { exactDecimal } from './form.ts'

// "Re-arm protection" on a trade Trad flagged after its stop or take profit was
// canceled or changed on the venue. Trad places the trade's current plan again;
// a child with no live order may get a new trigger price first.

export interface RearmChild {
  childId: string
  kind: 'stop_loss' | 'take_profit'
  label: string
  triggerPrice: string
}

export type RearmAvailability =
  | { kind: 'hidden' }
  | { kind: 'available' }
  | { kind: 'refused'; reason: string }

export function rearmAvailability(
  protection: NativeProtectionProjection | null,
): RearmAvailability {
  const rearm = protection?.rearm
  if (rearm === undefined || rearm === null) return { kind: 'hidden' }
  if (rearm.available) return { kind: 'available' }
  return {
    kind: 'refused',
    reason: rearm.refused_reason?.trim() || 'The protection cannot be re-armed now.',
  }
}

// Children without a live order at the venue; only these take a new price.
// A trailing stop cannot be re-armed with a new price.
export function rearmEditableChildren(protection: NativeProtectionProjection): RearmChild[] {
  const takeProfits = protection.plan.children.filter(
    (child) => child.protection_kind === 'take_profit',
  )
  return protection.plan.children
    .filter((child) => child.protection_kind !== 'trailing_stop')
    .filter((child) => hasNoLiveOrder(protection, child))
    .map((child) => ({
      childId: child.child_id,
      kind: child.protection_kind === 'stop_loss' ? 'stop_loss' : 'take_profit',
      label:
        child.protection_kind === 'stop_loss'
          ? 'Stop loss'
          : takeProfits.length === 1
            ? 'Take profit'
            : `TP ${takeProfits.indexOf(child) + 1}`,
      triggerPrice: child.trigger_price,
    }))
}

// Blank or unchanged prices are not edits.
export function rearmProtectionIntent(
  protection: NativeProtectionProjection,
  prices: Record<string, string> = {},
): BrowserCommandIntent {
  const editable = new Map(rearmEditableChildren(protection).map((child) => [child.childId, child]))
  const priceEdits = Object.entries(prices).flatMap(([childId, value]) => {
    const child = editable.get(childId)
    if (child === undefined) throw new Error('This order is still live; edit it after re-arming.')
    if (value.trim() === '' || value.trim() === child.triggerPrice) return []
    return [
      {
        child_id: childId,
        trigger_price: exactDecimal(value, `${child.label} trigger price`),
      },
    ]
  })
  return {
    kind: 'rearm_protection',
    parameters: {
      protection_id: protection.protection_id,
      expected_plan_revision: protection.plan_revision,
      ...(priceEdits.length === 0 ? {} : { price_edits: priceEdits }),
    },
  }
}

function hasNoLiveOrder(
  protection: NativeProtectionProjection,
  child: NativeProtectionChildPlan,
): boolean {
  const projected = protection.children[child.child_id]
  return projected === undefined || isExactZero(projected.confirmed_quantity)
}
