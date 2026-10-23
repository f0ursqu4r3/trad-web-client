import { expect, test } from '@playwright/test'
import type { BrowserAccountSnapshot } from '../src/lib/gateway/projection'
import { tradeWorkspaceProjection } from '../src/lib/projection/tradeWorkspace'
import { cardSummaryFields } from '../src/lib/projection/tradeSummaryShadow'
import { openWorkspace, WORKSPACE_ACCOUNT_ID, type Json } from './support/workspaceWire'

// Trade-summary slice S2 shadow mode: the gateway sends summaries next to the
// rows; the page compares them with its own cards and reports only through
// telemetry (nothing on screen changes).

const SCOPES: Record<string, string> = {
  'scope-filled': '51000000-0000-4000-8000-000000000001',
  'scope-chase': '51000000-0000-4000-8000-000000000002',
  'scope-trailing': '51000000-0000-4000-8000-000000000003',
}

// Production scope ids are UUIDs (telemetry context requires them).
function withUuidScopes(snapshot: Json): void {
  let text = JSON.stringify(snapshot)
  for (const [from, to] of Object.entries(SCOPES)) text = text.replaceAll(`"${from}"`, `"${to}"`)
  Object.assign(snapshot, JSON.parse(text))
}

// What the gateway would send: the card's own numbers (the goldens pin the
// two implementations together), without the coin-level block.
function serverSummaries(snapshot: Json): Json[] {
  const typed = snapshot as unknown as BrowserAccountSnapshot
  const cleared = { ...typed, checkpoint: { ...typed.checkpoint, new_risk_blocked_symbols: {} } }
  const model = tradeWorkspaceProjection(cleared)
  return [...model.activeTrades, ...model.closedTrades].map((trade) => ({
    ...cardSummaryFields(trade, cleared.positions),
    trade_id: trade.scopeId,
    revision: typed.checkpoint.projection_revision,
    // No coin is blocked in this fixture, so the overlay never applies.
    coin_block_applies: false,
  }))
}

function events(telemetry: Json[], name: string): Json[] {
  return telemetry.filter((event) => event.event_name === name)
}

test('matching summaries count as matched and report no mismatch', async ({ page }) => {
  const wire = await openWorkspace(page, {
    telemetry: true,
    editSnapshot: (snapshot) => {
      withUuidScopes(snapshot)
      snapshot.trade_summaries = serverSummaries(snapshot)
    },
  })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect
    .poll(() => events(wire.telemetry, 'trade_summary_shadow_measured').length, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const measured = events(wire.telemetry, 'trade_summary_shadow_measured')[0]!
  expect(measured.account_id).toBe(WORKSPACE_ACCOUNT_ID)
  expect(measured.properties).toMatchObject({
    cards: 3,
    matched: 3,
    mismatched: 0,
    missing_summary: 0,
    orphan_summary: 0,
    field_mismatches: 0,
  })
  expect(events(wire.telemetry, 'trade_summary_mismatch')).toEqual([])
})

test('a wrong summary is reported by field, in the snapshot and in a delta', async ({ page }) => {
  let summaries: Json[] = []
  const wire = await openWorkspace(page, {
    telemetry: true,
    editSnapshot: (snapshot) => {
      withUuidScopes(snapshot)
      summaries = serverSummaries(snapshot)
      const filled = summaries.find((row) => row.trade_id === SCOPES['scope-filled'])!
      filled.remaining_quantity = `${filled.remaining_quantity}9`
      snapshot.trade_summaries = summaries
    },
  })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect
    .poll(() => events(wire.telemetry, 'trade_summary_mismatch').length, { timeout: 10_000 })
    .toBe(1)
  const mismatch = events(wire.telemetry, 'trade_summary_mismatch')[0]!
  expect(mismatch.trade_id).toBe(SCOPES['scope-filled'])
  expect(mismatch.account_id).toBe(WORKSPACE_ACCOUNT_ID)
  expect(mismatch.properties.field_name).toBe('remaining_quantity')
  expect(mismatch.properties.reason_code).toBe('different')
  expect(mismatch.properties.client_digest).toMatch(/^[0-9a-f]{16}$/)
  expect(mismatch.properties.server_digest).toMatch(/^[0-9a-f]{16}$/)
  const measured = events(wire.telemetry, 'trade_summary_shadow_measured')[0]!
  expect(measured.properties).toMatchObject({ cards: 3, matched: 2, mismatched: 1 })

  // A delta replaces the chase card's summary with a wrong one.
  const chase = summaries.find((row) => row.trade_id === SCOPES['scope-chase'])!
  wire.sendDelta({ trade_summaries: [{ ...chase, revision: chase.revision + 1, symbol: 'DOGE' }] })
  await expect
    .poll(() => events(wire.telemetry, 'trade_summary_mismatch').length, { timeout: 10_000 })
    .toBe(2)
  const second = events(wire.telemetry, 'trade_summary_mismatch')[1]!
  expect(second.trade_id).toBe(SCOPES['scope-chase'])
  expect(second.properties.field_name).toBe('symbol')
  // Card values never leave the page.
  expect(JSON.stringify(wire.telemetry)).not.toContain('DOGE')
})
