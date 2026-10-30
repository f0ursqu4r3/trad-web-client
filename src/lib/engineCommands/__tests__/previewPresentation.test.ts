import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PREVIEW_EDITING_SETTLE_MS,
  editingGuidance,
  isEditingBarrier,
} from '../previewPresentation.ts'

test('only incomplete financial geometry is softened while editing', () => {
  assert.equal(isEditingBarrier('wrong_side_stop'), true)
  assert.equal(isEditingBarrier('wrong_side_take_profit'), true)
  assert.equal(isEditingBarrier('missing_stop_for_risk_sizing'), true)
  assert.equal(isEditingBarrier('zero_entry_stop_distance'), true)
  assert.equal(isEditingBarrier('below_minimum_order'), true)
  assert.equal(isEditingBarrier('above_maximum_order'), true)
  assert.equal(isEditingBarrier('invalid_price_precision'), true)
  // a draft mid-edit, or a price kept from the market the ticket just left
  assert.equal(isEditingBarrier('invalid_intent'), true)
  assert.equal(isEditingBarrier('limit_price_out_of_band'), true)
  assert.equal(isEditingBarrier('stale_market_evidence'), false)
  assert.equal(isEditingBarrier('missing_market_evidence'), false)
  assert.equal(isEditingBarrier('account_policy_barrier'), false)
  assert.equal(isEditingBarrier('unknown'), false)
})

test('editing guidance is specific and its quiet period is explicit', () => {
  assert.match(editingGuidance('wrong_side_stop'), /stop-loss/)
  assert.match(editingGuidance('wrong_side_take_profit'), /take-profit/)
  assert.match(editingGuidance('limit_price_out_of_band'), /limit price/)
  assert.equal(PREVIEW_EDITING_SETTLE_MS, 1_200)
})
