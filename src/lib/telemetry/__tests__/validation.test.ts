import assert from 'node:assert/strict'
import test from 'node:test'

import { safeTelemetryProperties } from '../validation.ts'

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
