import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HYPERLIQUID_AGENT_EXPIRY_WARNING_MS,
  HYPERLIQUID_AGENT_NEW_RISK_MARGIN_MS,
  agentExpiryNotice,
  agentExpiryNotices,
  formatRemaining,
  hyperliquidAgentExpiryState,
} from '../../agentExpiry.ts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = 1_800_000_000_000
const at = (ms: number) => `T${ms}`

test('agent expiry states match the node windows', () => {
  assert.equal(HYPERLIQUID_AGENT_EXPIRY_WARNING_MS, 7 * DAY)
  assert.equal(HYPERLIQUID_AGENT_NEW_RISK_MARGIN_MS, DAY)
  assert.equal(hyperliquidAgentExpiryState(null, NOW), 'unbounded')
  assert.equal(hyperliquidAgentExpiryState(undefined, NOW), 'unbounded')
  assert.equal(hyperliquidAgentExpiryState(NOW + 7 * DAY + 1, NOW), 'valid')
  assert.equal(hyperliquidAgentExpiryState(NOW + 7 * DAY, NOW), 'expiring_soon')
  assert.equal(hyperliquidAgentExpiryState(NOW + DAY + 1, NOW), 'expiring_soon')
  assert.equal(hyperliquidAgentExpiryState(NOW + DAY, NOW), 'new_risk_blocked')
  assert.equal(hyperliquidAgentExpiryState(NOW + 1, NOW), 'new_risk_blocked')
  assert.equal(hyperliquidAgentExpiryState(NOW, NOW), 'expired')
})

test('agent expiry notices warn from seven days and say what still works', () => {
  const account = (id: string, validUntil: number | null, exchange = 'hyperliquid') => ({
    id,
    label: `Acct ${id}`,
    exchange,
    exchange_metadata: { agent_valid_until_ms: validUntil },
  })
  assert.equal(agentExpiryNotice(account('a', null), NOW, at), null)
  assert.equal(agentExpiryNotice(account('a', NOW + 8 * DAY), NOW, at), null)
  assert.equal(agentExpiryNotice(account('a', NOW + 2 * DAY, 'bybit'), NOW, at), null)
  assert.equal(agentExpiryNotice({ id: 'x', label: 'x', exchange: 'hyperliquid' }, NOW, at), null)

  const soon = agentExpiryNotice(account('a', NOW + 5 * DAY + HOUR), NOW, at)
  assert.equal(soon?.state, 'expiring_soon')
  assert.equal(soon?.severity, 'warning')
  assert.equal(soon?.title, `Acct a: agent wallet expires in 5 days (T${NOW + 5 * DAY + HOUR}).`)
  assert.match(soon?.detail ?? '', /From 24 hours before it expires, Trad refuses new trades/)
  assert.match(soon?.detail ?? '', /closes keep working until it expires/)
  assert.match(soon?.detail ?? '', /exits included/)

  const blocked = agentExpiryNotice(account('b', NOW + 6 * HOUR), NOW, at)
  assert.equal(blocked?.state, 'new_risk_blocked')
  assert.equal(blocked?.severity, 'error')
  assert.match(blocked?.title ?? '', /new trades are refused/)
  assert.match(blocked?.title ?? '', /expires in 6 hours/)
  assert.match(blocked?.detail ?? '', /Closes keep working until it expires/)

  const expired = agentExpiryNotice(account('c', NOW - HOUR), NOW, at)
  assert.equal(expired?.state, 'expired')
  assert.equal(expired?.severity, 'error')
  assert.match(expired?.detail ?? '', /cannot sign orders for this account, closes and exits/)

  const ordered = agentExpiryNotices(
    [account('a', NOW + 5 * DAY), account('b', NOW + 6 * HOUR), account('z', null)],
    NOW,
    at,
  )
  assert.deepEqual(
    ordered.map((notice) => notice.accountId),
    ['b', 'a'],
  )
})

test('remaining time rounds down to whole units', () => {
  assert.equal(formatRemaining(7 * DAY), '7 days')
  assert.equal(formatRemaining(2 * DAY - 1), '1 day')
  assert.equal(formatRemaining(DAY - 1), '23 hours')
  assert.equal(formatRemaining(HOUR + 1), '1 hour')
  assert.equal(formatRemaining(59 * 60_000), '59 minutes')
  assert.equal(formatRemaining(90_000), '1 minute')
  assert.equal(formatRemaining(30_000), 'under a minute')
})
