import assert from 'node:assert/strict'
import test from 'node:test'

import { previewRejectionRemediation } from '../previewRemediation.ts'

test('routes a builder-approval rejection to the affected account setup', () => {
  assert.deepEqual(
    previewRejectionRemediation(
      'command planning failed: Hyperliquid builder approval does not cover this account policy',
      'account/with space',
    ),
    {
      title: 'Builder approval required',
      description:
        "Authorize Trad's builder-fe ceiling for this account before opening a new trade. This ceiling is not the fee charged; the current all-in target remains visible in the order ticket.",
      actionLabel: 'Review authorization',
      actionPath: '/settings/accounts/account%2Fwith%20space/setup',
    },
  )
})

test('leaves unrelated planner failures as technical errors', () => {
  assert.equal(
    previewRejectionRemediation('command planning failed: instrument rules are stale', 'account'),
    null,
  )
  assert.equal(
    previewRejectionRemediation(
      'Hyperliquid builder approval does not cover this account policy',
      '',
    ),
    null,
  )
})
