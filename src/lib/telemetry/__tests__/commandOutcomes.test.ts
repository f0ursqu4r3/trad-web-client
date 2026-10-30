import assert from 'node:assert/strict'
import test from 'node:test'

import { AccountUnavailableShown, commandOutcomeRecords } from '../commandOutcomes.ts'
import { safeTelemetryProperties } from '../validation.ts'

const link = {
  accountId: '1bd8d827-7e0b-52aa-a214-420a92c5fda0',
  actionAttemptId: '6c1ad0b2-5b55-4f2a-9a43-3d3c5f0a8d11',
  actionKind: 'partial_close' as const,
  requestId: 'f305b7fa-3d65-4ced-b5e1-564c8001f41c',
}
const commandId = '39000000-0000-4000-8000-000000000002'

// 2026-10-29: a close passed through reconciliation_required on a Chase
// cancel race and then succeeded; telemetry logged the transient state as
// the outcome, with a venue rejection, and lost the success.
test('a command passing through reconciliation is not an outcome', () => {
  for (const lifecycle of ['running', 'reconciliation_required'] as const) {
    assert.deepEqual(commandOutcomeRecords(link, { command_id: commandId, lifecycle }, 7), [])
  }
  const records = commandOutcomeRecords(link, { command_id: commandId, lifecycle: 'succeeded' }, 9)
  assert.deepEqual(
    records.map((record) => [record.eventName, record.properties?.outcome_code]),
    [
      ['command_terminal_observed', 'succeeded'],
      ['action_outcome_observed', 'succeeded'],
    ],
  )
  for (const record of records) {
    assert.equal(record.commandId, commandId)
    assert.equal(record.projectionRevision, 9)
    assert.deepEqual(safeTelemetryProperties(record.properties ?? {}), record.properties)
  }
})

test('only a failed command is a venue rejection', () => {
  for (const lifecycle of ['partially_succeeded', 'canceled'] as const) {
    const names = commandOutcomeRecords(link, { command_id: commandId, lifecycle }, 3).map(
      (record) => record.eventName,
    )
    assert.ok(!names.includes('venue_rejection_observed'), lifecycle)
  }
  const failed = commandOutcomeRecords(link, { command_id: commandId, lifecycle: 'failed' }, 3)
  assert.deepEqual(
    failed.map((record) => record.eventName),
    ['command_terminal_observed', 'action_outcome_observed', 'venue_rejection_observed'],
  )
})

// One unavailable account sent 1,124 account_unavailable_shown in 8 hours,
// one per subscription retry.
test('an unavailable account is reported once per reason until it changes', () => {
  const shown = new AccountUnavailableShown()
  const account = link.accountId
  assert.equal(shown.shouldRecord(account, 'unavailable'), true)
  for (let retry = 0; retry < 20; retry += 1) {
    assert.equal(shown.shouldRecord(account, 'unavailable'), false)
  }
  assert.equal(shown.shouldRecord(account, 'unauthorized'), true)
  assert.equal(shown.shouldRecord('2bd8d827-7e0b-52aa-a214-420a92c5fda0', 'unavailable'), true)
  // available again (a snapshot) or selected again: shown anew
  shown.forget(account)
  assert.equal(shown.shouldRecord(account, 'unauthorized'), true)
})
