import assert from 'node:assert/strict'
import test from 'node:test'

import {
  safeTelemetryProperties,
  validTelemetryBatchResult,
  validTelemetryContextIds,
} from '../validation.ts'

test('accepts only reviewed bounded telemetry properties', () => {
  assert.deepEqual(
    safeTelemetryProperties({
      action_kind: 'partial_close',
      blocker_code: 'RECONCILIATION_REQUIRED',
      source: 'managed_trade',
    }),
    {
      action_kind: 'partial_close',
      blocker_code: 'RECONCILIATION_REQUIRED',
      source: 'managed_trade',
    },
  )
})

test('rejects raw text, unknown keys, and oversized values', () => {
  assert.equal(safeTelemetryProperties({ reason_code: 'raw exception with spaces' }), null)
  assert.equal(safeTelemetryProperties({ unknown: 'value' } as Record<string, string>), null)
  assert.equal(safeTelemetryProperties({ reason_code: 'x'.repeat(129) }), null)
})

test('accepts UUID telemetry context and rejects composite internal scope identifiers', () => {
  assert.equal(
    validTelemetryContextIds({
      eventName: 'action_attempted',
      accountId: '1bd8d827-7e0b-52aa-a214-420a92c5fda0',
      tradeId: 'f305b7fa-3d65-4ced-b5e1-564c8001f41c',
    }),
    true,
  )
  assert.equal(
    validTelemetryContextIds({
      eventName: 'action_attempted',
      tradeId: 'scope:f305b7fa-3d65-4ced-b5e1-564c8001f41c',
    }),
    false,
  )
})

test('validates complete telemetry ingestion results', () => {
  assert.equal(
    validTelemetryBatchResult({
      collection_enabled: true,
      accepted: 30,
      duplicate: 1,
      invalid: 1,
      dropped: 0,
      sequence_gaps: 3,
    }),
    true,
  )
  assert.equal(
    validTelemetryBatchResult({
      collection_enabled: true,
      accepted: 1,
      duplicate: 0,
      invalid: -1,
      dropped: 0,
      sequence_gaps: 0,
    }),
    false,
  )
})
