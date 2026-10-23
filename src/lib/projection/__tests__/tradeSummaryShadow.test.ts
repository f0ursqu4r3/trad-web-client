import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import type {
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  TradeSummary,
} from '../../gateway/index.ts'
import { applyDelta, installSnapshot } from '../accountProjection.ts'
import { applyTradeSummaryChanges, snapshotTradeSummaries } from '../tradeSummaries.ts'
import { compareTradeWithSummary } from '../tradeSummaryShadow.ts'
import { tradeWorkspaceProjection } from '../tradeWorkspace.ts'

const FIXTURES = join(import.meta.dirname, 'fixtures', 'trade_summaries')

function fixture(name: string): { snapshot: BrowserAccountSnapshot; summaries: TradeSummary[] } {
  const read = (kind: string) =>
    JSON.parse(gunzipSync(readFileSync(join(FIXTURES, kind, `${name}.json.gz`))).toString('utf8'))
  const golden = read('goldens') as { trades: Record<string, Omit<TradeSummary, 'revision'>> }
  return {
    snapshot: read('inputs') as BrowserAccountSnapshot,
    summaries: Object.values(golden.trades).map((summary) => ({ ...summary, revision: 7 })),
  }
}

function summary(tradeId: string, revision = 1): TradeSummary {
  return { trade_id: tradeId, revision } as TradeSummary
}

test('a snapshot without summaries means the gateway sends none', () => {
  assert.equal(snapshotTradeSummaries(undefined), null)
  const index = snapshotTradeSummaries([summary('a'), { revision: 1 }, summary('b'), 'junk'])
  assert.deepEqual([...index!.keys()], ['a', 'b'])
})

test('delta summaries replace by trade id and removals drop; no change keeps the map', () => {
  const index = snapshotTradeSummaries([summary('a'), summary('b')])
  assert.equal(applyTradeSummaryChanges(index, undefined, undefined), index)
  assert.equal(applyTradeSummaryChanges(index, [], []), index)
  const next = applyTradeSummaryChanges(index, [summary('b', 2), summary('c', 2)], ['a'])!
  assert.deepEqual([...next.keys()].sort(), ['b', 'c'])
  assert.equal(next.get('b')?.revision, 2)
  assert.deepEqual([...index!.keys()], ['a', 'b'], 'the previous map is untouched')
  assert.equal(applyTradeSummaryChanges(null, [summary('x')], [])?.get('x')?.trade_id, 'x')
})

test('views keep summaries beside the rows, through deltas and history pages', () => {
  const { snapshot, summaries } = fixture('edge_stop_hit')
  const view = installSnapshot({ ...snapshot, trade_summaries: summaries })
  assert.equal(view.live.trade_summaries, undefined, 'the live rows never carry them')
  assert.equal(view.summaries?.size, summaries.length)
  const removed = summaries[0]!.trade_id
  const changed = { ...summaries[1]!, revision: 8, remaining_quantity: '1' }
  const delta: BrowserAccountDelta = {
    checkpoint: {
      ...snapshot.checkpoint,
      projection_revision: snapshot.checkpoint.projection_revision + 1,
    },
    commands: [],
    execution_groups: [],
    chases: [],
    trailing_entries: [],
    close_workflows: [],
    flatten_workflows: [],
    entry_cancellations: [],
    account_controls: [],
    protection_amendments: [],
    native_protections: [],
    orders: [],
    positions: [],
    executions: [],
    balances: [],
    protections: [],
    relationships: [],
    trade_summaries: [changed],
    removed_trade_summaries: [removed],
  }
  const next = applyDelta(view, delta)
  assert.equal(next.summaries?.has(removed), false)
  assert.equal(next.summaries?.get(changed.trade_id)?.revision, 8)
  assert.equal(next.live.trade_summaries, undefined)
  const quiet = applyDelta(next, {
    ...delta,
    checkpoint: {
      ...delta.checkpoint,
      projection_revision: delta.checkpoint.projection_revision + 1,
    },
    trade_summaries: undefined,
    removed_trade_summaries: undefined,
  })
  assert.equal(quiet.summaries, next.summaries)
  assert.equal(
    installSnapshot(snapshot).summaries,
    null,
    'an old gateway leaves the index empty, not all-missing',
  )
})

test('every golden card matches its summary, and a changed field is named', () => {
  for (const name of ['edge_stop_hit', 'edge_partial_close', 'edge_chase_over_budget', 'light']) {
    const { snapshot, summaries } = fixture(name)
    const cleared = {
      ...snapshot,
      checkpoint: { ...snapshot.checkpoint, new_risk_blocked_symbols: {} },
    }
    const model = tradeWorkspaceProjection(cleared)
    const byId = new Map(summaries.map((row) => [row.trade_id, row]))
    for (const trade of [...model.activeTrades, ...model.closedTrades]) {
      const server = byId.get(trade.scopeId)!
      assert.deepEqual(compareTradeWithSummary(trade, server, null, cleared.positions), [], name)
      const wrong = { ...server, remaining_quantity: `${server.remaining_quantity}1` }
      assert.deepEqual(
        compareTradeWithSummary(trade, wrong, null, cleared.positions).map((row) => row.field),
        ['remaining_quantity'],
      )
    }
  }
})

test('the coin-level block is overlaid on the summary as the card applies it', () => {
  const { snapshot, summaries } = fixture('edge_coin_blocked')
  const blocked = snapshot.checkpoint.new_risk_blocked_symbols ?? {}
  assert.ok(Object.keys(blocked).length > 0)
  const model = tradeWorkspaceProjection(snapshot)
  const byId = new Map(summaries.map((row) => [row.trade_id, row]))
  let attention = 0
  for (const trade of [...model.activeTrades, ...model.closedTrades]) {
    if (trade.lifecycle === 'attention') attention += 1
    const reason = blocked[trade.symbol] ?? null
    assert.deepEqual(
      compareTradeWithSummary(trade, byId.get(trade.scopeId)!, reason, snapshot.positions),
      [],
      trade.scopeId,
    )
  }
  assert.ok(attention > 0, 'the fixture really turns a card to attention')
})
