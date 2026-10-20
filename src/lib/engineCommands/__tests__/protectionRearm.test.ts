import assert from 'node:assert/strict'
import test from 'node:test'

import type { NativeProtectionProjection } from '../../gateway/index.ts'
import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import {
  rearmAvailability,
  rearmEditableChildren,
  rearmProtectionIntent,
} from '../protectionRearm.ts'

function flaggedProtection(): NativeProtectionProjection {
  const protection = engineProjectionSnapshot().native_protections[0]!
  const stop = protection.plan.children.find((child) => child.protection_kind === 'stop_loss')!
  protection.status = 'reconciliation_required'
  protection.failure_reason = 'owned protection stop loss was canceled at the venue outside Trad'
  protection.children[stop.child_id]!.confirmed_quantity = '0'
  protection.children[stop.child_id]!.remote_order_ids = []
  protection.rearm = { available: true }
  return protection
}

test('re-arm shows only while the trade is flagged and names the refusal', () => {
  const protection = flaggedProtection()
  assert.deepEqual(rearmAvailability(protection), { kind: 'available' })

  protection.rearm = { available: false, refused_reason: 'a close is still working' }
  assert.deepEqual(rearmAvailability(protection), {
    kind: 'refused',
    reason: 'a close is still working',
  })

  protection.rearm = undefined
  assert.deepEqual(rearmAvailability(protection), { kind: 'hidden' })
  assert.deepEqual(rearmAvailability(null), { kind: 'hidden' })
})

test('only children without a live order take a new price', () => {
  const protection = flaggedProtection()
  const children = rearmEditableChildren(protection)

  assert.deepEqual(
    children.map((child) => [child.label, child.triggerPrice]),
    [['Stop loss', '1800.125']],
  )
})

test('re-arm sends the projected plan revision and only real price edits', () => {
  const protection = flaggedProtection()
  const stop = rearmEditableChildren(protection)[0]!
  const takeProfit = protection.plan.children.find(
    (child) => child.protection_kind === 'take_profit',
  )!

  assert.deepEqual(rearmProtectionIntent(protection), {
    kind: 'rearm_protection',
    parameters: { protection_id: protection.protection_id, expected_plan_revision: 4 },
  })
  assert.deepEqual(
    rearmProtectionIntent(protection, { [stop.childId]: ' ' }),
    rearmProtectionIntent(protection),
  )
  assert.deepEqual(
    rearmProtectionIntent(protection, { [stop.childId]: '1800.125' }),
    rearmProtectionIntent(protection),
  )
  assert.deepEqual(rearmProtectionIntent(protection, { [stop.childId]: '1750.5' }), {
    kind: 'rearm_protection',
    parameters: {
      protection_id: protection.protection_id,
      expected_plan_revision: 4,
      price_edits: [{ child_id: stop.childId, trigger_price: '1750.5' }],
    },
  })
  assert.throws(
    () => rearmProtectionIntent(protection, { [stop.childId]: 'abc' }),
    /Stop loss trigger price must be a plain decimal number/,
  )
  assert.throws(
    () => rearmProtectionIntent(protection, { [takeProfit.child_id]: '2200' }),
    /still live/,
  )
})
