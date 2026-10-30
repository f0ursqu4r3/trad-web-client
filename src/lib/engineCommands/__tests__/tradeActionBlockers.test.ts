import assert from 'node:assert/strict'
import test from 'node:test'

import { engineProjectionSnapshot } from '../../../views/e2e/engineProjectionFixtureData.ts'
import type { NativeProtectionProjection } from '../../gateway/index.ts'
import { blockerExplanation, closeBlock, protectionBlock } from '../tradeActionBlockers.ts'

function protection(change: Partial<NativeProtectionProjection> = {}): NativeProtectionProjection {
  const row = engineProjectionSnapshot().native_protections.find((item) => item.symbol === 'ETH')!
  return { ...row, status: 'tracking', ...change }
}

// 2026-10-29 16:25:59: Edit protection right after a partial close was
// refused as RECONCILIATION_REQUIRED while the stop was only being resized.
test('Edit protection waits for a protection settling after a fill', () => {
  for (const status of ['pending', 'installing', 'resizing'] as const) {
    assert.deepEqual(protectionBlock(protection({ status }), false), {
      blocker: 'PROTECTION_SETTLING',
      reasonCode: status,
    })
  }
  assert.deepEqual(
    protectionBlock(
      protection({ status: 'reconciliation_required', resizing_after_fill: true }),
      false,
    ),
    { blocker: 'PROTECTION_SETTLING', reasonCode: 'resizing_after_fill' },
  )
  assert.match(blockerExplanation('PROTECTION_SETTLING', null), /opens as soon as it is ready/)
})

test('real reconciliation and finished protections still block Edit protection', () => {
  assert.deepEqual(protectionBlock(protection({ status: 'reconciliation_required' }), false), {
    blocker: 'RECONCILIATION_REQUIRED',
    reasonCode: 'reconciliation_required',
  })
  assert.deepEqual(protectionBlock(protection({ status: 'triggered' }), false), {
    blocker: 'PROTECTION_NOT_TRACKING',
    reasonCode: 'triggered',
  })
  // nothing to protect yet: there is nothing to settle toward
  assert.deepEqual(
    protectionBlock(protection({ status: 'pending', target_quantity: '0' }), false),
    {
      blocker: 'PROTECTION_NOT_TRACKING',
      reasonCode: 'pending',
    },
  )
  assert.deepEqual(protectionBlock(protection(), true), {
    blocker: 'PROTECTION_AMENDMENT_ACTIVE',
    reasonCode: 'amendment_active',
  })
  assert.equal(protectionBlock(protection(), false), null)
  assert.equal(protectionBlock(null, false), null)
})

test('a close is refused for reconciliation only when the protection really needs it', () => {
  const input = {
    closeAvailable: false,
    hasRemainingExposure: true,
    activeClose: false,
    position: null,
  }
  assert.deepEqual(
    closeBlock({
      ...input,
      protection: protection({ status: 'reconciliation_required', resizing_after_fill: true }),
    }),
    { blocker: 'POSITION_INCONSISTENT', reasonCode: 'no_position' },
  )
  assert.deepEqual(
    closeBlock({ ...input, protection: protection({ status: 'reconciliation_required' }) }),
    { blocker: 'RECONCILIATION_REQUIRED', reasonCode: 'reconciliation_required' },
  )
  assert.deepEqual(closeBlock({ ...input, activeClose: true, protection: null }), {
    blocker: 'ACTIVE_CLOSE_EXISTS',
    reasonCode: 'active_close',
  })
  assert.equal(closeBlock({ ...input, closeAvailable: true, protection: null }), null)
})
