import assert from 'node:assert/strict'
import test from 'node:test'

import type { CommandProjection } from '../../gateway/projection.ts'
import { duplicateCommandPrefill } from '../prefill.ts'

test('duplicates an accepted split limit as exact planned base quantity and protection', () => {
  const prefill = duplicateCommandPrefill(
    command('place_execution_group', {
      purpose: 'split',
      children: [
        { request: request('0.10000001') },
        { request: request('0.20000002') },
      ],
      protection: {
        scope_id: 'scope',
        controller: {
          kind: 'native',
          children: [
            {
              protection_kind: 'take_profit',
              trigger_price: '2100.00000001',
              trigger_source: 'mark_price',
              execution: { kind: 'limit', price: '2099.50000001' },
              allocation: { kind: 'fraction', value: '0.33333333' },
            },
            {
              protection_kind: 'stop_loss',
              trigger_price: '1800.00000001',
              trigger_source: 'mark_price',
              execution: { kind: 'bounded_market', worst_price: '1790' },
              allocation: { kind: 'full_remaining' },
            },
          ],
        },
      },
    }),
    'account',
  )

  assert.equal(prefill?.modal, 'EngineLimitOrder')
  if (prefill?.modal !== 'EngineLimitOrder') return
  assert.equal(prefill.values.amount, '0.30000003')
  assert.equal(prefill.values.sizingMode, 'base')
  assert.equal(prefill.values.shapeMode, 'split')
  assert.equal(prefill.values.maxChildren, '2')
  assert.equal(prefill.values.protection.takeProfits[0]?.allocationValue, '33.333333')
  assert.equal(prefill.values.protection.stopLoss.executionKind, 'market')
})

test('duplicates Chase duration and Trailing Entry semantics without floating point', () => {
  const chase = duplicateCommandPrefill(
    command(
      'place_chase',
      {
        plan: {
          symbol: 'BTC',
          position_side: 'short',
          quantity: '0.00100001',
          protection: null,
          adverse_boundary: { kind: 'basis_points', value: '25.125' },
          expires_at: 61_000,
          remainder_policy: 'cancel',
        },
      },
      1_000,
    ),
    'account',
  )
  assert.equal(chase?.modal, 'EngineChaseOrder')
  if (chase?.modal === 'EngineChaseOrder') {
    assert.equal(chase.values.expirySeconds, '60')
    assert.equal(chase.values.boundaryValue, '25.125')
  }

  const trailing = duplicateCommandPrefill(
    command('place_trailing_entry', {
      plan: {
        symbol: 'SOL',
        position_side: 'long',
        activation_price: '145.25000001',
        jump_threshold: '10.25',
        stop_loss: '140',
        take_profit: '155.00000001',
        risk_amount: '25.00000001',
        instrument: {},
        execution: { children: [{}, {}, {}] },
        one_way: { semantics: 'target_side_exposure' },
      },
    }),
    'account',
  )
  assert.equal(trailing?.modal, 'EngineTrailingEntry')
  if (trailing?.modal === 'EngineTrailingEntry') {
    assert.equal(trailing.values.activationPrice, '145.25000001')
    assert.equal(trailing.values.shapeMode, 'split')
    assert.equal(trailing.values.maxChildren, '3')
    assert.equal(trailing.values.oneWaySemantics, 'target_side_exposure')
  }
})

test('does not offer duplicate for mutations or ambiguous execution groups', () => {
  assert.equal(duplicateCommandPrefill(command('cancel_order', {}), 'account'), null)
  assert.equal(
    duplicateCommandPrefill(
      command('place_execution_group', {
        purpose: 'staged_execution',
        children: [{ request: request('1') }],
      }),
      'account',
    ),
    null,
  )
})

function request(quantity: string): Record<string, unknown> {
  return {
    symbol: 'ETH',
    position_side: 'long',
    quantity,
    execution: { kind: 'limit', price: '1900.00000001', time_in_force: 'post_only' },
  }
}

function command(
  kind: string,
  parameters: Record<string, unknown>,
  acceptedAt = 0,
): CommandProjection {
  return {
    command_id: 'command',
    accepted_at: acceptedAt,
    accepted: { kind, parameters },
    root: { kind: 'command', id: 'command' },
    operation_ids: [],
    lifecycle: 'running',
    failure_reason: null,
  }
}
