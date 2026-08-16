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
