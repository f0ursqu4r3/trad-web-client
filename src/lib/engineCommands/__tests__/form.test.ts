import assert from 'node:assert/strict'
import test from 'node:test'

import {
  exactDecimal,
  newEntryProtectionState,
  newProtectionState,
  newTakeProfit,
  normalizedSymbol,
  protectionAmendmentIntent,
  protectionIntent,
  shapeIntent,
  sizingModeFromPreference,
  sizingModePreference,
  sizingIntent,
} from '../form.ts'
import { protectionForm } from '../protectionAmendment.ts'
import {
  buildCancelEntryWorkIntent,
  buildFlattenIntent,
  buildPlaceChaseIntent,
  buildPlaceOrderIntent,
  buildPlaceTrailingEntryIntent,
} from '../intents.ts'
test('persisted quantity preferences map explicitly to typed sizing modes', () => {
  assert.equal(sizingModeFromPreference('notional'), 'quote_notional')
  assert.equal(sizingModeFromPreference('base'), 'base')
  assert.equal(sizingModeFromPreference('risk'), 'risk_at_stop')
  assert.equal(sizingModePreference('quote_notional'), 'notional')
  assert.equal(sizingModePreference('base'), 'base')
  assert.equal(sizingModePreference('risk_at_stop'), 'risk')
})

test('financial input remains an exact decimal string', () => {
  assert.equal(exactDecimal(' 0.0042000100 ', 'quantity'), '0.0042000100')
  assert.deepEqual(sizingIntent('base', '0.0042000100'), {
    kind: 'base',
    quantity: '0.0042000100',
  })
  assert.throws(() => exactDecimal('1e-8', 'quantity'), /plain decimal/)
  assert.throws(() => exactDecimal('0', 'quantity'), /greater than zero/)
})

test('new entry protection starts with a mark-triggered stop-market', () => {
  const protection = newEntryProtectionState()
  assert.equal(protection.stopLoss.enabled, true)
  assert.equal(protection.stopLoss.triggerSource, 'mark_price')
  assert.equal(protection.stopLoss.executionKind, 'market')
})

test('split shape enforces the public protocol bound', () => {
  assert.deepEqual(shapeIntent('single', '', ''), { kind: 'single' })
  assert.deepEqual(shapeIntent('split', '100.25', '20'), {
    kind: 'split',
    target_child_notional: '100.25',
    max_children: 20,
  })
  assert.throws(() => shapeIntent('split', '', '51'), /between 1 and 50/)
})

test('take-profit percentages convert to exact fractions without floating point', () => {
  const protection = newProtectionState()
  const first = newTakeProfit('first')
  first.triggerPrice = '65000.125'
  first.allocationKind = 'fraction'
  first.allocationValue = '33.333'
  protection.takeProfits.push(first)

  assert.deepEqual(protectionIntent(protection), {
    take_profits: [
      {
        trigger_price: '65000.125',
        trigger_source: 'mark_price',
        execution: { kind: 'limit', price: '65000.125' },
        allocation: { kind: 'fraction', fraction: '0.33333' },
      },
    ],
  })
  first.allocationValue = '100.001'
  assert.throws(() => protectionIntent(protection), /cannot exceed 100%/)
})

test('projected protection plans round-trip exact values and retained child identities', () => {
  const protectionId = '00000000-0000-0000-0000-000000000100'
  const takeProfitId = '00000000-0000-0000-0000-000000000101'
  const stopLossId = '00000000-0000-0000-0000-000000000102'
  const form = protectionForm({
    protection_id: protectionId,
    children: [
      {
        child_id: takeProfitId,
        client_order_id: 'trad-take-profit',
        protection_kind: 'take_profit',
        trigger_price: '65000.1250',
        trigger_source: 'mark_price',
        execution: { kind: 'bounded_market', worst_price: '64990.5000' },
        allocation: { kind: 'fraction', value: '0.5' },
      },
      {
        child_id: stopLossId,
        client_order_id: 'trad-stop-loss',
        protection_kind: 'stop_loss',
        trigger_price: '62000.2500',
        trigger_source: 'mark_price',
        execution: { kind: 'bounded_market', worst_price: '61950.0000' },
        allocation: { kind: 'full_remaining' },
      },
    ],
  })

  assert.equal(form.takeProfits[0]?.childId, takeProfitId)
  assert.equal(form.takeProfits[0]?.allocationValue, '50')
  assert.equal(form.takeProfits[0]?.executionKind, 'market')
  assert.equal(form.stopLoss.childId, stopLossId)
  form.takeProfits.push({
    ...newTakeProfit('new-take-profit'),
    triggerPrice: '66000.0000',
    allocationKind: 'fraction',
    allocationValue: '25',
  })

  assert.deepEqual(protectionAmendmentIntent(protectionId, 7, form), {
    kind: 'amend_protection',
    parameters: {
      protection_id: protectionId,
      expected_plan_revision: 7,
      take_profits: [
        {
          child_id: takeProfitId,
          trigger_price: '65000.1250',
          trigger_source: 'mark_price',
          execution: { kind: 'limit', price: '65000.1250' },
          allocation: { kind: 'fraction', fraction: '0.5' },
        },
        {
          trigger_price: '66000.0000',
          trigger_source: 'mark_price',
          execution: { kind: 'limit', price: '66000.0000' },
          allocation: { kind: 'fraction', fraction: '0.25' },
        },
      ],
      stop_loss: {
        child_id: stopLossId,
        trigger_price: '62000.2500',
        trigger_source: 'mark_price',
        execution: { kind: 'market' },
      },
    },
  })
})

test('symbols are normalized but never exchange-guessed', () => {
  assert.equal(normalizedSymbol(' btc-usdc '), 'BTC-USDC')
  assert.throws(() => normalizedSymbol('BTC/USDC'), /unsupported characters/)
})

test('order drafts produce the exact protocol-3 wire intent', () => {
  const protection = newProtectionState()
  protection.stopLoss.enabled = true
  protection.stopLoss.triggerPrice = '62000.00'

  assert.deepEqual(
    buildPlaceOrderIntent({
      executionKind: 'limit',
      symbol: ' btc ',
      positionSide: 'long',
      sizingMode: 'risk_at_stop',
      amount: '25.500',
      limitPrice: '63000.125',
      timeInForce: 'post_only',
      shapeMode: 'single',
      targetChildNotional: '',
      maxChildren: '20',
      protection,
    }),
    {
      kind: 'place_order',
      parameters: {
        symbol: 'BTC',
        position_side: 'long',
        sizing: { kind: 'risk_at_stop', loss_amount: '25.500' },
        execution: { kind: 'limit', price: '63000.125', time_in_force: 'post_only' },
        protection: {
          take_profits: [],
          stop_loss: {
            trigger_price: '62000.00',
            trigger_source: 'mark_price',
            execution: { kind: 'market' },
          },
        },
        shape: { kind: 'single' },
      },
    },
  )
})

test('chase drafts preserve exact boundaries and convert whole-second expiry', () => {
  assert.deepEqual(
    buildPlaceChaseIntent({
      symbol: 'ETH',
      positionSide: 'short',
      sizingMode: 'base',
      amount: '0.12500',
      boundaryKind: 'basis_points',
      boundaryValue: '12.5',
      expirySeconds: '90',
      remainder: 'cancel',
      protection: newProtectionState(),
    }),
    {
      kind: 'place_chase',
      parameters: {
        symbol: 'ETH',
        position_side: 'short',
        sizing: { kind: 'base', quantity: '0.12500' },
        adverse_boundary: { kind: 'basis_points', value: '12.5' },
        expires_after_ms: 90_000,
        remainder: 'cancel',
      },
    },
  )
})

test('trailing-entry and flatten drafts map directly to public intents', () => {
  assert.deepEqual(
    buildPlaceTrailingEntryIntent({
      symbol: 'btc',
      positionSide: 'long',
      activationPrice: '63000',
      jumpBasisPoints: '10',
      stopLossPrice: '62000',
      takeProfitPrice: '65000',
      riskAmount: '100',
      shapeMode: 'single',
      targetChildNotional: '',
      maxChildren: '20',
      oneWaySemantics: 'target_side_exposure',
    }),
    {
      kind: 'place_trailing_entry',
      parameters: {
        symbol: 'BTC',
        position_side: 'long',
        activation_price: '63000',
        jump_basis_points: '10',
        stop_loss_price: '62000',
        take_profit_price: '65000',
        risk_amount: '100',
        shape: { kind: 'single' },
        one_way_semantics: 'target_side_exposure',
      },
    },
  )
  assert.deepEqual(buildFlattenIntent('symbol', 'eth'), {
    kind: 'flatten',
    parameters: { target: { kind: 'symbol', symbol: 'ETH' } },
  })
  assert.deepEqual(buildCancelEntryWorkIntent('account', ''), {
    kind: 'cancel_entry_work',
    parameters: { target: { kind: 'account' } },
  })
})
