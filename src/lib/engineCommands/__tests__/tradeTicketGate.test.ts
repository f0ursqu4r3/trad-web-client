import assert from 'node:assert/strict'
import test from 'node:test'

import {
  accountCommandReadiness,
  newExposureReadiness,
} from '../../gateway/accountCommandReadiness.ts'
import {
  tradeTicketBlocker,
  tradeTicketGate,
  type TradeTicketGateInput,
} from '../tradeTicketGate.ts'

const ready: TradeTicketGateInput = {
  accountId: '1bd8d827-7e0b-52aa-a214-420a92c5fda0',
  marketPending: false,
  draftError: null,
  gatewayConnected: true,
  accountReadiness: accountCommandReadiness(true, 'ready'),
  previewStatus: 'ready',
  previewReady: true,
}
const submit = { submitting: false, planningIntentReady: true, previewStatus: 'ready' as const }

// 2026-10-29 07:05:44 (switching BTC to TAO) and 07:06:19 (a Chase confirm):
// both submits were blocked as UNCLASSIFIED_BLOCKER.
test('every reason the ticket holds a submit has its own blocker code', () => {
  const cases: Array<[Partial<TradeTicketGateInput>, string]> = [
    [{ accountId: '' }, 'ACCOUNT_NOT_HYDRATED'],
    [{ marketPending: true }, 'MARKET_SELECTION_PENDING'],
    [{ draftError: 'enter a stop loss price' }, 'FORM_INVALID'],
    [{ gatewayConnected: false }, 'TRANSPORT_OFFLINE'],
    [{ accountReadiness: accountCommandReadiness(true, 'subscribing') }, 'ACCOUNT_NOT_HYDRATED'],
    [{ accountReadiness: accountCommandReadiness(false, 'ready') }, 'TRANSPORT_OFFLINE'],
    [
      { accountReadiness: accountCommandReadiness(true, 'ready', false) },
      'AGENT_APPROVAL_REQUIRED',
    ],
    [
      {
        accountReadiness: newExposureReadiness(accountCommandReadiness(true, 'ready'), {
          summary: { reconciliation_ready: false } as never,
        }),
      },
      'ACCOUNT_RECONCILING',
    ],
    [
      {
        accountReadiness: newExposureReadiness(
          accountCommandReadiness(true, 'ready'),
          {
            summary: { reconciliation_ready: true } as never,
            new_risk_blocked_symbols: { TAO: 'a TAO fill matches no Trad order' },
          },
          'TAO',
        ),
      },
      'NEW_RISK_PAUSED',
    ],
    [{ previewReady: false, previewStatus: 'planning' }, 'PREVIEW_PENDING'],
  ]
  for (const [change, blocker] of cases) {
    const gate = tradeTicketGate({ ...ready, ...change })
    assert.ok(gate !== null, blocker)
    assert.ok(gate.message.length > 0)
    assert.equal(tradeTicketBlocker(gate, submit), blocker)
  }
})

test('a ticket with nothing to wait for blocks only for what canSubmit adds', () => {
  assert.equal(tradeTicketGate(ready), null)
  assert.equal(tradeTicketBlocker(null, { ...submit, submitting: true }), 'SUBMISSION_IN_FLIGHT')
  assert.equal(tradeTicketBlocker(null, { ...submit, planningIntentReady: false }), 'FORM_INVALID')
  assert.equal(tradeTicketGate({ ...ready, previewStatus: 'rejected', previewReady: false }), null)
  assert.equal(
    tradeTicketBlocker(null, { ...submit, previewStatus: 'rejected' }),
    'COMMAND_REJECTED',
  )
})
