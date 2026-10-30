import type { AccountReadinessCode } from '../gateway/accountCommandReadiness.ts'
import type { TelemetryBlockerCode } from './catalog.ts'

// Readiness reasons were matched as text, and none of the current messages
// matched: every reconnecting, initializing, paused or reconciling refusal was
// UNCLASSIFIED_BLOCKER. The readiness now says which it is.
export function readinessBlocker(code: AccountReadinessCode | null): TelemetryBlockerCode {
  switch (code) {
    case 'gateway_reconnecting':
      return 'TRANSPORT_OFFLINE'
    case 'account_initializing':
      return 'ACCOUNT_NOT_HYDRATED'
    case 'agent_approval_required':
      return 'AGENT_APPROVAL_REQUIRED'
    case 'new_risk_paused':
      return 'NEW_RISK_PAUSED'
    case 'account_reconciling':
      return 'ACCOUNT_RECONCILING'
    case null:
      return 'UNCLASSIFIED_BLOCKER'
  }
}
