import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeRows } from '../graph.ts'

interface Row {
  id: string
  version: number
}

// The merge every projection array used before placed merges: rebuild by
// identity, later rows win, sort by localeCompare.
function referenceMerge(existing: Row[], incoming: Row[]): Row[] {
  if (incoming.length === 0) return existing
  const rows = new Map(existing.map((row) => [row.id, row]))
  for (const row of incoming) rows.set(row.id, row)
  return Array.from(rows.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row)
}

function randomId(random: () => number): string {
  const shapes = [
    () => `synthetic-fill-${Math.floor(random() * 400)}`,
    () =>
      `${Math.floor(random() * 16).toString(16)}0000000-0000-4000-8000-${Math.floor(random() * 60)}`,
    () => `command:${Math.floor(random() * 30)}->order:${Math.floor(random() * 30)}`,
    () => ['BTC', 'ETH', 'eth', 'Eth', 'SOL', '@12', 'xyz:TSLA', 'ZEC'][Math.floor(random() * 8)]!,
  ]
  return shapes[Math.floor(random() * shapes.length)]!()
}

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

test('placed merges match the full rebuild over random delta sequences', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const random = seeded(seed)
    let version = 0
    const batch = (size: number) =>
      Array.from({ length: size }, () => ({ id: randomId(random), version: ++version }))
    // A snapshot arrives unsorted and may repeat identities.
    let actual = batch(Math.floor(random() * 300))
    let expected = actual
    for (let step = 0; step < 25; step += 1) {
      const size = random() < 0.1 ? 0 : random() < 0.9 ? 1 + Math.floor(random() * 4) : 300
      const incoming = batch(size)
      actual = mergeRows(actual, incoming, (row) => row.id)
      expected = referenceMerge(expected, incoming)
      assert.deepEqual(actual, expected, `seed ${seed} step ${step}`)
    }
  }
})

test('a placed merge leaves the previous array untouched', () => {
  const first = mergeRows(
    [],
    [
      { id: 'b', version: 1 },
      { id: 'd', version: 2 },
    ],
    (row) => row.id,
  )
  const copy = [...first]
  const second = mergeRows(
    first,
    [
      { id: 'c', version: 3 },
      { id: 'b', version: 4 },
    ],
    (row) => row.id,
  )
  assert.deepEqual(first, copy)
  assert.deepEqual(
    second.map((row) => `${row.id}${row.version}`),
    ['b4', 'c3', 'd2'],
  )
  assert.equal(
    mergeRows(second, [], (row) => row.id),
    second,
  )
})
