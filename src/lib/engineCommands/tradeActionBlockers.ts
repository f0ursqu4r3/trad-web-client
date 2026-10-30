import type { NativeProtectionProjection, PositionProjection } from '../gateway/index.ts'
import { isExactZero } from '../exactDecimalMath.ts'
import { presentedProtectionStatus } from '../projection/confirmation.ts'
import type { TelemetryBlockerCode } from '../telemetry/catalog.ts'

// Why a managed trade's close or Edit protection is unavailable, with the
// state behind it as a stable token for telemetry (`reason_code`).
//
// The engine amends only a Tracking protection. Right after a fill (a
// partial close that fills in pieces, an entry whose stop is being placed)
// the protection is Pending, Installing or Resizing for one venue round trip;
// that is settling, and Edit protection waits for it instead of refusing
// (2026-10-29: an Edit right after a partial close was blocked as
// "reconciliation required"). A protection flagged only because a fill
// shrank the trade before a sibling was resized, with that resize in flight
// (`resizing_after_fill`), is settling too. Real reconciliation still blocks.

export interface ActionBlock {
  blocker: TelemetryBlockerCode
  reasonCode: string
}

export function protectionBlock(
  protection: NativeProtectionProjection | null,
  amendmentActive: boolean,
): ActionBlock | null {
  if (protection === null) return null
  const status = presentedProtectionStatus(protection)
  if (status === 'reconciliation_required') {
    return { blocker: 'RECONCILIATION_REQUIRED', reasonCode: status }
  }
  if (settling(protection)) {
    return {
      blocker: 'PROTECTION_SETTLING',
      reasonCode: protection.resizing_after_fill === true ? 'resizing_after_fill' : status,
    }
  }
  if (status !== 'tracking') return { blocker: 'PROTECTION_NOT_TRACKING', reasonCode: status }
  if (amendmentActive) {
    return { blocker: 'PROTECTION_AMENDMENT_ACTIVE', reasonCode: 'amendment_active' }
  }
  return null
}

export interface CloseBlockInput {
  closeAvailable: boolean
  hasRemainingExposure: boolean
  activeClose: boolean
  position: Pick<PositionProjection, 'status'> | null
  protection: NativeProtectionProjection | null
}

export function closeBlock(input: CloseBlockInput): ActionBlock | null {
  if (input.closeAvailable || !input.hasRemainingExposure) return null
  if (input.activeClose) return { blocker: 'ACTIVE_CLOSE_EXISTS', reasonCode: 'active_close' }
  if (input.position?.status === 'awaiting_exchange_confirmation') {
    return { blocker: 'POSITION_CONFIRMING', reasonCode: input.position.status }
  }
  // Only this trade's own state explains a missing close. A flag elsewhere on
  // the coin never does; the engine decides whether a close goes out.
  if (
    input.protection !== null &&
    presentedProtectionStatus(input.protection) === 'reconciliation_required'
  ) {
    return { blocker: 'RECONCILIATION_REQUIRED', reasonCode: 'reconciliation_required' }
  }
  return {
    blocker: 'POSITION_INCONSISTENT',
    reasonCode: input.position?.status ?? 'no_position',
  }
}

export function blockerExplanation(
  blocker: TelemetryBlockerCode,
  activeCloseMessage: string | null,
): string {
  switch (blocker) {
    case 'POSITION_CONFIRMING':
      return 'Trad is confirming the latest position change with the exchange. This action will become available automatically.'
    case 'RECONCILIATION_REQUIRED':
      return 'This trade needs reconciliation before Trad can safely change its exposure or protection.'
    case 'ACTIVE_CLOSE_EXISTS':
      return (
        activeCloseMessage ??
        'A close is already active for this trade. Wait for its outcome before submitting another.'
      )
    case 'PROTECTION_SETTLING':
      return 'Trad is updating the protection to the latest fill. The editor opens as soon as it is ready.'
    case 'PROTECTION_NOT_TRACKING':
      return 'Protection is not tracking, so it cannot be edited safely.'
    case 'PROTECTION_AMENDMENT_ACTIVE':
      return 'A protection edit is already active.'
    default:
      return 'Trad cannot prove this action is safe from the current account projection.'
  }
}

// Placing or resizing toward a position Trad holds, with nothing flagged.
function settling(protection: NativeProtectionProjection): boolean {
  if (isExactZero(protection.target_quantity)) return false
  if (protection.resizing_after_fill === true) return true
  return (
    protection.status === 'pending' ||
    protection.status === 'installing' ||
    protection.status === 'resizing'
  )
}
