// Hyperliquid agent wallets can carry an expiry (`validUntil`, stored as
// `exchange_metadata.agent_valid_until_ms`). After it the agent cannot sign,
// so exits stop working too. The node refuses new risk from 24 hours before
// it. These mirror account-contracts/src/agent_expiry.rs; the Gateway does
// not send them.
export const HYPERLIQUID_AGENT_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000
export const HYPERLIQUID_AGENT_NEW_RISK_MARGIN_MS = 24 * 60 * 60 * 1000

export type AgentExpiryState =
  | 'unbounded'
  | 'valid'
  | 'expiring_soon' // inside the warning window, new trades still allowed
  | 'new_risk_blocked' // inside the margin: closes only
  | 'expired'

export function hyperliquidAgentExpiryState(
  validUntilMs: number | null | undefined,
  nowMs: number,
): AgentExpiryState {
  if (typeof validUntilMs !== 'number' || !Number.isFinite(validUntilMs)) return 'unbounded'
  const remaining = validUntilMs - nowMs
  if (remaining <= 0) return 'expired'
  if (remaining <= HYPERLIQUID_AGENT_NEW_RISK_MARGIN_MS) return 'new_risk_blocked'
  if (remaining <= HYPERLIQUID_AGENT_EXPIRY_WARNING_MS) return 'expiring_soon'
  return 'valid'
}

export interface AgentExpiryAccount {
  id: string
  label: string
  exchange: string
  exchange_metadata?: { agent_valid_until_ms?: number | null } | null
}

export interface AgentExpiryNotice {
  accountId: string
  label: string
  state: 'expiring_soon' | 'new_risk_blocked' | 'expired'
  validUntilMs: number
  remainingMs: number
  severity: 'warning' | 'error'
  title: string
  detail: string
}

const AFTER_EXPIRY = 'after that Trad cannot sign any order for this account, exits included.'

// `formatTime` renders the expiry instant (the page uses the viewer's local time).
export type FormatTime = (unixMs: number) => string

export function agentExpiryNotice(
  account: AgentExpiryAccount,
  nowMs: number,
  formatTime: FormatTime,
): AgentExpiryNotice | null {
  if (account.exchange !== 'hyperliquid') return null
  const validUntilMs = account.exchange_metadata?.agent_valid_until_ms
  const state = hyperliquidAgentExpiryState(validUntilMs, nowMs)
  if (state === 'unbounded' || state === 'valid' || typeof validUntilMs !== 'number') return null
  const remainingMs = validUntilMs - nowMs
  const when = formatTime(validUntilMs)
  const base = { accountId: account.id, label: account.label, state, validUntilMs, remainingMs }
  if (state === 'expiring_soon') {
    return {
      ...base,
      severity: 'warning',
      title: `${account.label}: agent wallet expires in ${formatRemaining(remainingMs)} (${when}).`,
      detail:
        'From 24 hours before it expires, Trad refuses new trades on this account; closes keep ' +
        `working until it expires, ${AFTER_EXPIRY} Renew the agent approval before then.`,
    }
  }
  if (state === 'new_risk_blocked') {
    return {
      ...base,
      severity: 'error',
      title: `${account.label}: new trades are refused. Its agent wallet expires in ${formatRemaining(remainingMs)} (${when}).`,
      detail: `Closes keep working until it expires; ${AFTER_EXPIRY} Renew the agent approval to trade again.`,
    }
  }
  return {
    ...base,
    severity: 'error',
    title: `${account.label}: agent wallet expired ${when}.`,
    detail:
      'Trad cannot sign orders for this account, closes and exits included. Renew the agent approval.',
  }
}

// Soonest expiry first.
export function agentExpiryNotices(
  accounts: readonly AgentExpiryAccount[],
  nowMs: number,
  formatTime: FormatTime,
): AgentExpiryNotice[] {
  const notices: AgentExpiryNotice[] = []
  for (const account of accounts) {
    const notice = agentExpiryNotice(account, nowMs, formatTime)
    if (notice !== null) notices.push(notice)
  }
  return notices.sort((a, b) => a.validUntilMs - b.validUntilMs)
}

// Whole units, rounded down: "6 days", "23 hours", "under a minute".
export function formatRemaining(ms: number): string {
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (ms >= 2 * day) return `${Math.floor(ms / day)} days`
  if (ms >= day) return '1 day'
  if (ms >= 2 * hour) return `${Math.floor(ms / hour)} hours`
  if (ms >= hour) return '1 hour'
  if (ms >= 2 * minute) return `${Math.floor(ms / minute)} minutes`
  if (ms >= minute) return '1 minute'
  return 'under a minute'
}
