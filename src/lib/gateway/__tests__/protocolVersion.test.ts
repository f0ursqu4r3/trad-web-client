import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROTOCOL_RELOAD_GUARD_MS,
  protocolMismatchAction,
  protocolMismatchFromClose,
  type ReloadStampStorage,
} from '../protocolVersion.ts'

function memoryStorage(): ReloadStampStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  }
}

test('reads the gateway protocol refusal and nothing else', () => {
  assert.deepEqual(
    protocolMismatchFromClose(1008, 'browser protocol mismatch: expected 16, received 15'),
    { expected: 16, actual: 15 },
  )
  assert.equal(
    protocolMismatchFromClose(1011, 'browser protocol mismatch: expected 16, received 15'),
    null,
  )
  assert.equal(
    protocolMismatchFromClose(1008, 'websocket ticket is invalid, expired, or already consumed'),
    null,
  )
  assert.equal(protocolMismatchFromClose(1008, 'authenticated websocket lease expired'), null)
  assert.equal(
    protocolMismatchFromClose(1008, 'browser protocol mismatch: expected 15, received 15'),
    null,
  )
})

test('an out-of-date page reloads once, then asks, then may reload again later', () => {
  const storage = memoryStorage()
  const mismatch = { expected: 16, actual: 15 }
  assert.equal(protocolMismatchAction(mismatch, storage, 1_000_000), 'reload')
  assert.equal(protocolMismatchAction(mismatch, storage, 1_000_000 + 30_000), 'reload_required')
  assert.equal(
    protocolMismatchAction(mismatch, storage, 1_000_000 + PROTOCOL_RELOAD_GUARD_MS - 1),
    'reload_required',
  )
  assert.equal(
    protocolMismatchAction(mismatch, storage, 1_000_000 + PROTOCOL_RELOAD_GUARD_MS + 1),
    'reload',
  )
})

test('an older gateway is waited for; no storage or broken storage never auto-reloads', () => {
  assert.equal(
    protocolMismatchAction({ expected: 14, actual: 15 }, memoryStorage(), 1),
    'wait_for_server',
  )
  assert.equal(protocolMismatchAction({ expected: 16, actual: 15 }, null, 1), 'reload_required')
  const broken: ReloadStampStorage = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  assert.equal(protocolMismatchAction({ expected: 16, actual: 15 }, broken, 1), 'reload_required')
})
