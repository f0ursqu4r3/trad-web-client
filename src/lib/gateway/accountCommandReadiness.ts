import type { BrowserCommandIntent } from './intent.ts'
import type { ProjectionCheckpoint } from './projection.ts'

export type AccountCommandProjectionStatus =
  | 'idle'
  | 'subscribing'
  | 'ready'
  | 'stale'
  | 'error'
  | null
  | undefined

// Why commands wait, for telemetry (`readinessBlocker`); the reason is the
// text the client is shown.
export type AccountReadinessCode =
  | 'gateway_reconnecting'
  | 'account_initializing'
  | 'agent_approval_required'
  | 'new_risk_paused'
  | 'account_reconciling'

export interface AccountCommandReadiness {
  ready: boolean
  reason: string | null
  code: AccountReadinessCode | null
}

const READY: AccountCommandReadiness = { ready: true, reason: null, code: null }

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
    return { ready: false, reason: GATEWAY_RECONNECTING_MESSAGE, code: 'gateway_reconnecting' }
  }
  if (projectionStatus !== 'ready') {
    return {
      ready: false,
      reason: ACCOUNT_ENGINE_INITIALIZING_MESSAGE,
      code: 'account_initializing',
    }
  }
  if (!exchangeCredentialReady) {
    return {
      ready: false,
      reason: HYPERLIQUID_AGENT_APPROVAL_REQUIRED_MESSAGE,
      code: 'agent_approval_required',
    }
  }
  return READY
}

export type NewRiskCheckpoint = Pick<
  ProjectionCheckpoint,
  'summary' | 'new_risk_blocked_reason' | 'new_risk_blocked_symbols'
>

// New risk is refused only for the engine's own account-level or coin-level
// blocks, with its reason. Flags on single trades never block other trades.
export function newExposureReadiness(
  commandReadiness: AccountCommandReadiness,
  checkpoint: NewRiskCheckpoint | null | undefined,
  symbol: string | null = null,
): AccountCommandReadiness {
  if (!commandReadiness.ready) return commandReadiness
  const accountReason = checkpoint?.new_risk_blocked_reason?.trim()
  if (accountReason) {
    return { ready: false, reason: newTradesPaused(accountReason), code: 'new_risk_paused' }
  }
  // A projection stored before the engine gave its reason.
  if (checkpoint?.summary.reconciliation_ready !== true) {
    return { ready: false, reason: ACCOUNT_RECONCILING_MESSAGE, code: 'account_reconciling' }
  }
  const coin = symbol === null ? null : coinBlock(checkpoint.new_risk_blocked_symbols, symbol)
  if (coin !== null) {
    return {
      ready: false,
      reason: newTradesPaused(coin.reason, coin.symbol),
      code: 'new_risk_paused',
    }
  }
  return READY
}

// The engine's coin names are canonical; a typed symbol may differ in case.
function coinBlock(
  blocked: Record<string, string> | undefined,
  symbol: string,
): { symbol: string; reason: string } | null {
  if (blocked === undefined) return null
  const wanted = symbol.trim().toUpperCase()
  for (const [coin, reason] of Object.entries(blocked)) {
    if (coin.toUpperCase() === wanted && reason.trim() !== '') return { symbol: coin, reason }
  }
  return null
}

function newTradesPaused(reason: string, symbol: string | null = null): string {
  const scope = symbol === null ? 'New trades are paused' : `New ${symbol} trades are paused`
  return `${scope}: ${reason}. Closing and canceling remain available.`
}

// The coin a new-risk intent opens on, when the intent names it.
export function newExposureSymbol(intent: BrowserCommandIntent): string | null {
  switch (intent.kind) {
    case 'place_order':
    case 'place_chase':
    case 'place_trailing_entry':
      return intent.parameters.symbol.trim() || null
    default:
      return null
  }
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
