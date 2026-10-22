import assert from 'node:assert/strict'
import test from 'node:test'

import { accountListAge, reconcileAccountList } from '../../accountRefresh.ts'

const account = (id: string, label: string, metadata: Record<string, unknown> = {}) => ({
  id,
  label,
  exchange: 'hyperliquid',
  exchange_metadata: { agent_approved: true, ...metadata },
})

test('an unchanged refresh keeps the current list and objects', () => {
  const current = [account('a', 'Main'), account('b', 'Side')]
  const fetched = JSON.parse(JSON.stringify(current))
  assert.equal(reconcileAccountList(current, fetched), null)
})

test('a changed account is replaced while unchanged ones keep their objects', () => {
  const current = [account('a', 'Main'), account('b', 'Side')]
  const fetched = [account('a', 'Main'), account('b', 'Side', { default_leverage: 3 })]
  const next = reconcileAccountList(current, fetched)!
  assert.equal(next[0], current[0])
  assert.notEqual(next[1], current[1])
  assert.equal(next[1]!.exchange_metadata.default_leverage, 3)
})

test('added, removed and reordered accounts produce a new list', () => {
  const current = [account('a', 'Main'), account('b', 'Side')]
  const added = reconcileAccountList(current, [...current, account('c', 'New')])!
  assert.deepEqual(
    added.map(({ id }) => id),
    ['a', 'b', 'c'],
  )
  assert.equal(added[0], current[0])
  assert.deepEqual(
    reconcileAccountList(current, [account('a', 'Main')])!.map(({ id }) => id),
    ['a'],
  )
  const swapped = reconcileAccountList(current, [account('b', 'Side'), account('a', 'Main')])!
  assert.equal(swapped[0], current[1])
  assert.equal(swapped[1], current[0])
})

test('fields that are absent or undefined compare equal', () => {
  const current = [{ id: 'a', label: 'Main', vault: undefined }]
  assert.equal(reconcileAccountList(current, [{ id: 'a', label: 'Main' }]), null)
})

test('the list age is infinite before the first fetch', () => {
  assert.equal(accountListAge(null, 1_000), Number.POSITIVE_INFINITY)
  assert.equal(accountListAge(400, 1_000), 600)
})
