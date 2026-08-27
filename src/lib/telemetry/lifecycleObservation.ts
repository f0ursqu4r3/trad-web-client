import type { LifecycleAction } from '@/lib/engineCommands/lifecycle'

import type { TelemetryActionKind } from './index.ts'

export function lifecycleTelemetryKind(
  kind: LifecycleAction['kind'] | undefined,
): TelemetryActionKind {
  switch (kind) {
    case 'modify_order':
      return 'modify'
    case 'close_exposure':
    case 'close_trailing_entry':
      return 'partial_close'
    case 'take_over_exposure':
      return 'take_over'
    case 'amend_trailing_entry':
      return 'amend_trailing_entry'
    case 'activate_trailing_entry':
    case 'enter_trailing_entry':
      return 'activate_trailing_entry'
    case 'continue_trailing_entry':
      return 'continue_trailing_entry'
    case 'cancel_order':
    case 'cancel_chase':
    case 'cancel_trailing_entry':
    default:
      return 'cancel'
  }
}
