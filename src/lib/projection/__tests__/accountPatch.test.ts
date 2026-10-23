import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

import type { BrowserAccountDelta, BrowserAccountSnapshot } from '../../gateway/index.ts'
import {
  AccountPatchError,
  applyChanges,
  applyObjectPatch,
  expandAccountPatch,
  type BrowserAccountPatch,
} from '../accountPatch.ts'
import { applyDelta, installSnapshot, type AccountProjectionView } from '../accountProjection.ts'

// Protocol 17 patches against the golden the backend writes from its
// hub (gateway-contracts/tests/fixtures/delta_patches/edges.json, from
// backend commit b68eb528, gzip -9 -n): edge fixture walks with the window
// before them, each patch with the full delta the hub sent, and the hub's
// window after. Expanding each patch here must give that delta exactly,
// and applying the deltas must leave every row the hub's window holds.
// Refresh: TRAD_WRITE_PATCH_GOLDEN=1 cargo test -p trad-gateway-contracts
// --test contracts patch_golden, then copy it here.

interface Walk {
  name: string
  snapshot: BrowserAccountSnapshot
  steps: Array<{ patch: BrowserAccountPatch; delta: BrowserAccountDelta }>
  final: BrowserAccountSnapshot
}

const GOLDEN = join(import.meta.dirname, 'fixtures', 'delta_patches', 'edges.json.gz')

function walks(): Walk[] {
  return (JSON.parse(gunzipSync(readFileSync(GOLDEN)).toString('utf8')) as { walks: Walk[] }).walks
}

// JSON with sorted keys, so rows compare by value.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, entry: unknown) =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
        )
      : entry,
  )
}

const ROWS = [
  'commands',
  'execution_groups',
  'chases',
  'trailing_entries',
  'close_workflows',
  'flatten_workflows',
  'entry_cancellations',
  'account_controls',
  'protection_amendments',
  'native_protections',
  'orders',
  'positions',
  'executions',
  'balances',
  'protections',
] as const

test('every golden patch expands to the delta the hub sent', () => {
  let steps = 0
  for (const walk of walks()) {
    let view: AccountProjectionView = installSnapshot(walk.snapshot)
    for (const [index, step] of walk.steps.entries()) {
      const expanded = expandAccountPatch(view, step.patch)
      assert.deepEqual(expanded, step.delta, `${walk.name} step ${index}`)
      view = applyDelta(view, expanded)
      steps += 1
    }
    // every row of the hub's window, which patches name by key, is in the
    // tab's window with the same value (the tab prunes less eagerly, so it
    // may hold more)
    for (const field of ROWS) {
      const held = new Set(view.live[field].map((row) => canonical(row)))
      for (const row of walk.final[field]) {
        assert.ok(held.has(canonical(row)), `${walk.name}: ${field} row missing after the walk`)
      }
    }
    const summaries = new Set([...(view.summaries?.values() ?? [])].map((row) => canonical(row)))
    for (const row of walk.final.trade_summaries ?? []) {
      assert.ok(summaries.has(canonical(row)), `${walk.name}: summary missing after the walk`)
    }
  }
  assert.ok(steps > 20, `${steps} golden steps`)
})

test('patches are smaller than the deltas they stand for', () => {
  let full = 0
  let slim = 0
  for (const walk of walks()) {
    for (const step of walk.steps) {
      full += JSON.stringify(step.delta).length
      slim += JSON.stringify(step.patch).length
    }
  }
  assert.ok(slim < full / 2, `patches ${slim} bytes against ${full}`)
})

test('object patches set, nest, replace whole and unset', () => {
  const old = { a: 1, n: { x: 1, y: [1, 2] }, o: null, gone: 4, keep: { k: true } }
  const patched = applyObjectPatch(old, {
    a: 2,
    n: { y: [1, 3] },
    o: { $set: { asset: 'USDC' } },
    $unset: ['gone'],
  })
  assert.deepEqual(patched, {
    a: 2,
    n: { x: 1, y: [1, 3] },
    o: { asset: 'USDC' },
    keep: { k: true },
  })
  // rows are never edited in place; unchanged parts are shared
  assert.deepEqual(old.n, { x: 1, y: [1, 2] })
  assert.equal(patched.keep, old.keep)
  assert.throws(() => applyObjectPatch(old, { a: { x: 1 } }), AccountPatchError)
})

test('a patch for a row the window lacks fails, and a failed resume leaves the view', () => {
  const walk = walks()[0]!
  const view = installSnapshot(walk.snapshot)
  const missing: BrowserAccountPatch = {
    checkpoint: { projection_revision: walk.snapshot.checkpoint.projection_revision + 1 },
    orders: [{ $id: 'not-a-window-order', status: 'filled' }],
  }
  assert.throws(() => expandAccountPatch(view, missing), AccountPatchError)
  const good = walk.steps[0]!.patch
  assert.throws(() => applyChanges(view, [{ patch: good }, { patch: missing }]))
  assert.equal(
    view.live.checkpoint.projection_revision,
    walk.snapshot.checkpoint.projection_revision,
  )
  const applied = applyChanges(view, [{ patch: good }])
  assert.deepEqual(applied.deltas, [walk.steps[0]!.delta])
})
