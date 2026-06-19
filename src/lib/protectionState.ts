import { ProtectionLifecycle, ProtectionStrategy, type ProtectionState } from '@/lib/ws/protocol'
import { formatName } from '@/lib/utils'

export type ProtectionDisplay = {
  label: string
  status: string
  className: string
  text: string
}

export function protectionStrategyLabel(strategy: ProtectionStrategy): string {
  switch (strategy) {
    case ProtectionStrategy.ManagedGuard:
      return 'Managed Guard'
    case ProtectionStrategy.NativeAttachedTpsl:
      return 'Native TP/SL'
    case ProtectionStrategy.NativePositionTpsl:
      return 'Position TP/SL'
    default:
      return formatName(strategy)
  }
}

export function protectionLifecycleLabel(lifecycle: ProtectionLifecycle): string {
  switch (lifecycle) {
    case ProtectionLifecycle.PendingParent:
      return 'Pending'
    case ProtectionLifecycle.ParentAccepted:
      return 'Parent Accepted'
    case ProtectionLifecycle.ParentPartiallyFilled:
      return 'Parent Partial'
    case ProtectionLifecycle.Active:
      return 'Active'
    case ProtectionLifecycle.Triggered:
      return 'Triggered'
    case ProtectionLifecycle.Canceled:
      return 'Canceled'
    case ProtectionLifecycle.Rejected:
      return 'Rejected'
    case ProtectionLifecycle.Complete:
      return 'Complete'
    default:
      return 'Unknown'
  }
}

export function protectionLifecycleClass(lifecycle: ProtectionLifecycle): string {
  switch (lifecycle) {
    case ProtectionLifecycle.Active:
    case ProtectionLifecycle.Complete:
      return 'pill-info'
    case ProtectionLifecycle.Triggered:
    case ProtectionLifecycle.PendingParent:
    case ProtectionLifecycle.ParentAccepted:
    case ProtectionLifecycle.ParentPartiallyFilled:
      return 'pill-warn'
    case ProtectionLifecycle.Canceled:
    case ProtectionLifecycle.Rejected:
      return 'pill-err'
    default:
      return ''
  }
}

export function protectionDisplay(
  state: ProtectionState | null | undefined,
): ProtectionDisplay | null {
  if (!state) return null
  const label = protectionStrategyLabel(state.strategy)
  const status = protectionLifecycleLabel(state.lifecycle)
  return {
    label,
    status,
    className: protectionLifecycleClass(state.lifecycle),
    text: `${label}: ${status}`,
  }
}
