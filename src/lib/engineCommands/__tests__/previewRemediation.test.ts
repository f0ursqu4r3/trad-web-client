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
        'Complete the one-time wallet approval for this account. Your configured fee will not change.',
      actionLabel: 'Authorize builder now →',
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
