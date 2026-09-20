import type { BrowserCommandIntent } from './intent.ts'

export type AccountCommandProjectionStatus =
  | 'idle'
  | 'subscribing'
  | 'ready'
  | 'stale'
  | 'error'
  | null
  | undefined

export interface AccountCommandReadiness {
  ready: boolean
  reason: string | null
}

export const ACCOUNT_ENGINE_INITIALIZING_MESSAGE =
  'Account engine is initializing. Exchange controls will unlock automatically when it is ready.'

export const GATEWAY_RECONNECTING_MESSAGE =
  'Gateway is reconnecting. Exchange controls will unlock automatically when it is ready.'

export const HYPERLIQUID_AGENT_APPROVAL_REQUIRED_MESSAGE =
  'Approve the Hyperliquid agent wallet before using exchange controls.'

export const ACCOUNT_RECONCILING_MESSAGE =
  'Account setup or exchange reconciliation is still running. New trades will unlock automatically when the server reports ready; closing and canceling remain available.'

export function accountCommandReadiness(
  gatewayReady: boolean,
  projectionStatus: AccountCommandProjectionStatus,
  exchangeCredentialReady = true,
): AccountCommandReadiness {
  if (!gatewayReady) {
    return { ready: false, reason: GATEWAY_RECONNECTING_MESSAGE }
  }
  if (projectionStatus !== 'ready') {
    return { ready: false, reason: ACCOUNT_ENGINE_INITIALIZING_MESSAGE }
  }
  if (!exchangeCredentialReady) {
    return { ready: false, reason: HYPERLIQUID_AGENT_APPROVAL_REQUIRED_MESSAGE }
  }
  return { ready: true, reason: null }
}

export function newExposureReadiness(
  commandReadiness: AccountCommandReadiness,
  reconciliationReady: boolean | null | undefined,
): AccountCommandReadiness {
  if (!commandReadiness.ready) return commandReadiness
  if (reconciliationReady !== true) {
    return { ready: false, reason: ACCOUNT_RECONCILING_MESSAGE }
  }
  return { ready: true, reason: null }
}

export function isNewExposureIntent(intent: BrowserCommandIntent): boolean {
  switch (intent.kind) {
    case 'place_order':
    case 'place_chase':
    case 'place_trailing_entry':
    case 'amend_trailing_entry':
    case 'activate_trailing_entry':
    case 'enter_trailing_entry':
    case 'continue_trailing_entry':
      return true
    default:
      return false
  }
}
