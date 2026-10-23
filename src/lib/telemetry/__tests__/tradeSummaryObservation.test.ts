import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import type { BrowserAccountSnapshot, TradeSummary } from '../../gateway/index.ts'
import { tradeWorkspaceProjection } from '../../projection/tradeWorkspace.ts'
import type { TelemetryRecord } from '../contract.ts'
import {
  FULL_SWEEP_MS,
  MEASURE_WINDOW_MS,
  sessionDigest,
  TradeSummaryShadow,
  type ShadowInput,
} from '../tradeSummaryObservation.ts'
import {
  safeTelemetryProperties,
  validTelemetryContextIds,
  validTelemetryEventContext,
  validTelemetryEventShape,
} from '../validation.ts'

const ACCOUNT = '10000000-0000-4000-8000-000000000001'
const FIXTURES = join(
  import.meta.dirname,
  '..',
  '..',
  'projection',
  '__tests__',
  'fixtures',
  'trade_summaries',
)

function setup() {
  const read = (kind: string) =>
    JSON.parse(gunzipSync(readFileSync(join(FIXTURES, kind, 'light.json.gz'))).toString('utf8'))
  const snapshot = read('inputs') as BrowserAccountSnapshot
  const golden = read('goldens') as { trades: Record<string, Omit<TradeSummary, 'revision'>> }
  const cleared = {
    ...snapshot,
    checkpoint: { ...snapshot.checkpoint, new_risk_blocked_symbols: {} },
  }
  const model = tradeWorkspaceProjection(cleared)
  const summaries = new Map(
    Object.values(golden.trades).map((row) => [
      row.trade_id,
      { ...row, revision: 3 } as TradeSummary,
    ]),
  )
  let now = 0
  const records: TelemetryRecord[] = []
  const shadow = new TradeSummaryShadow(
    () => now,
    (record) => records.push(record),
    async (text) => text.length.toString(16).padStart(16, '0'),
  )
  const input = (overrides: Partial<ShadowInput> = {}): ShadowInput => ({
    accountId: ACCOUNT,
    projectionRevision: 42,
    trades: [...model.activeTrades, ...model.closedTrades],
    summaries,
    positions: cleared.positions,
    blockedSymbols: {},
    ...overrides,
  })
  return { shadow, records, summaries, input, at: (next: number) => (now = next), model }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

test('matching cards report counts only, first after the first sweep', async () => {
  const { shadow, records, input, summaries } = setup()
  shadow.compare(input())
  await settle()
  assert.equal(records.length, 1)
  assert.equal(records[0]!.eventName, 'trade_summary_shadow_measured')
  assert.deepEqual(records[0]!.properties, {
    cards: summaries.size,
    matched: summaries.size,
    mismatched: 0,
    missing_summary: 0,
    orphan_summary: 0,
    comparisons: summaries.size,
    field_mismatches: 0,
    window_ms: 0,
  })
  assert.equal(
    validTelemetryEventShape('trade_summary_shadow_measured', records[0]!.properties!),
    true,
  )
})

test('a mismatch names the field once per trade and field, with digests, not values', async () => {
  const { shadow, records, input, summaries, at } = setup()
  const [tradeId, original] = [...summaries.entries()][0]!
  const wrong = new Map(summaries)
  wrong.set(tradeId, {
    ...original,
    realized_pnl: [{ asset: 'USDC', amount: '123.456' }],
    revision: 4,
  })
  shadow.compare(input({ summaries: wrong }))
  at(1_000)
  shadow.compare(
    input({ summaries: new Map(wrong).set(tradeId, { ...wrong.get(tradeId)!, revision: 5 }) }),
  )
  await settle()
  const mismatches = records.filter((row) => row.eventName === 'trade_summary_mismatch')
  assert.equal(mismatches.length, 1)
  const event = mismatches[0]!
  assert.equal(event.tradeId, tradeId)
  assert.equal(event.accountId, ACCOUNT)
  assert.equal(event.projectionRevision, 42)
  assert.equal(event.properties?.field_name, 'realized_pnl')
  assert.equal(event.properties?.summary_revision, 4)
  assert.match(String(event.properties?.client_digest), /^[0-9a-f]{16}$/)
  assert.notEqual(event.properties?.client_digest, event.properties?.server_digest)
  assert.ok(!JSON.stringify(event).includes('123.456'), 'no financial value leaves the browser')
  assert.equal(validTelemetryEventShape('trade_summary_mismatch', event.properties!), true)
  assert.equal(safeTelemetryProperties(event.properties!) !== null, true)
  assert.equal(validTelemetryEventContext(event), true)
  const measured = records.find((row) => row.eventName === 'trade_summary_shadow_measured')!
  assert.equal(measured.properties?.mismatched, 1)
  assert.equal(measured.properties?.field_mismatches, 1)
})

test('cards without a summary and summaries without a card are counted', async () => {
  const { shadow, records, input, summaries, model } = setup()
  const partial = new Map(summaries)
  const dropped = model.activeTrades[0]?.scopeId ?? model.closedTrades[0]!.scopeId
  partial.delete(dropped)
  partial.set('90000000-0000-4000-8000-000000000009', {
    trade_id: 'orphan',
    revision: 1,
  } as TradeSummary)
  shadow.compare(input({ summaries: partial }))
  await settle()
  const counts = records[0]!.properties!
  assert.equal(counts.missing_summary, 1)
  assert.equal(counts.orphan_summary, 1)
  assert.equal(counts.matched, summaries.size - 1)
})

test('between sweeps only changed summaries are compared; a sweep re-checks all', async () => {
  const { shadow, records, input, summaries, at } = setup()
  shadow.compare(input())
  at(5_000)
  const [tradeId, original] = [...summaries.entries()][0]!
  shadow.compare(
    input({ summaries: new Map(summaries).set(tradeId, { ...original, revision: 9 }) }),
  )
  at(FULL_SWEEP_MS + 5_000)
  shadow.compare(input())
  at(MEASURE_WINDOW_MS + 1)
  shadow.compare(input())
  await settle()
  const measured = records.filter((row) => row.eventName === 'trade_summary_shadow_measured')
  assert.equal(measured.length, 2)
  // 1 changed card at 5 s and a sweep at 35 s; nothing changed at 60 s.
  assert.equal(measured[1]!.properties?.comparisons, 1 + summaries.size)
  assert.equal(measured[1]!.properties?.window_ms, MEASURE_WINDOW_MS + 1)
})

test('the measurement shapes are exact', () => {
  assert.equal(
    validTelemetryEventShape('trade_summary_mismatch', {
      field_name: 'not_a_field',
      reason_code: 'different',
      summary_revision: 1,
      client_digest: '0123456789abcdef',
      server_digest: '0123456789abcdef',
    }),
    false,
  )
  assert.equal(
    validTelemetryEventShape('trade_summary_mismatch', {
      field_name: 'total_fees',
      reason_code: 'different',
      summary_revision: 1,
      client_digest: '12.5',
      server_digest: '0123456789abcdef',
    }),
    false,
  )
  assert.equal(
    validTelemetryEventContext({ eventName: 'trade_summary_mismatch', accountId: ACCOUNT }),
    false,
  )
  assert.equal(
    validTelemetryEventShape('trade_summary_shadow_measured', { cards: 1, matched: 1 }),
    false,
  )
  assert.equal(
    validTelemetryContextIds({ eventName: 'trade_summary_mismatch', tradeId: ACCOUNT }),
    true,
  )
})

test('session digests are salted, stable within the session and 16 hex digits', async () => {
  const first = sessionDigest()
  const second = sessionDigest()
  const a = await first('"0.383"')
  assert.match(a, /^[0-9a-f]{16}$/)
  assert.equal(await first('"0.383"'), a)
  assert.notEqual(await second('"0.383"'), a)
})
