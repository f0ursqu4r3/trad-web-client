import assert from 'node:assert/strict'
import test from 'node:test'

import type { Timers } from '../marketSubscriptionPolicy.ts'
import { ProjectionConfirmations, type ProjectionProbe } from '../projectionConfirm.ts'

const ACCOUNT = '10000000-0000-4000-8000-000000000001'

class ManualClock implements Timers {
  now = 0
  private nextId = 1
  private readonly pending = new Map<number, { at: number; callback: () => void }>()

  set = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++
    this.pending.set(id, { at: this.now + delayMs, callback })
    return id
  }

  clear = (timer: number): void => {
    this.pending.delete(timer)
  }

  // Runs due timers in order; `during` lets the test change the world as
  // time passes.
  advance(ms: number, during: (now: number) => void = () => {}): void {
    const until = this.now + ms
    for (;;) {
      const due = [...this.pending.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort(([, a], [, b]) => a.at - b.at)[0]
      if (due === undefined) break
      const [id, timer] = due
      this.pending.delete(id)
      during(timer.at)
      this.now = timer.at
      timer.callback()
    }
    during(until)
    this.now = until
  }
}

function harness(initialRevision = 10) {
  const clock = new ManualClock()
  const probe: ProjectionProbe = {
    live: true,
    revision: initialRevision,
    accountDeltas: 0,
    frames: 0,
  }
  const resyncs: Array<{ at: number; reason: string }> = []
  const confirmations = new ProjectionConfirmations(
    clock,
    () => clock.now,
    () => ({ ...probe }),
    (_accountId, reason) => resyncs.push({ at: clock.now, reason }),
  )
  return { clock, probe, resyncs, confirmations }
}

test('a confirmation that arrives late on a slow but flowing link never resnapshots', () => {
  const { clock, probe, resyncs, confirmations } = harness()
  confirmations.watch(ACCOUNT, 14)
  // One delta every 2.5 s: the revision creeps up and reaches 14 at 10 s.
  clock.advance(19_000, (now) => {
    const revision = Math.min(14, 10 + Math.floor(now / 2_500))
    if (revision > probe.revision!) {
      probe.revision = revision
      probe.accountDeltas += 1
      probe.frames += 1
    }
  })
  assert.deepEqual(resyncs, [])
  assert.equal(confirmations.pending(ACCOUNT), null)
})

test('a stalled link (nothing arrives) waits for the full deadline', () => {
  const { clock, resyncs, confirmations } = harness()
  confirmations.watch(ACCOUNT, 11)
  clock.advance(19_999)
  assert.deepEqual(resyncs, [])
  clock.advance(1)
  assert.equal(resyncs.length, 1)
  assert.equal(resyncs[0]!.at, 20_000)
  assert.match(resyncs[0]!.reason, /revision 11 was not observed after 20s; current revision is 10/)
})

test('a live socket whose account feed stays silent resyncs after two quiet checks', () => {
  const { clock, probe, resyncs, confirmations } = harness()
  confirmations.watch(ACCOUNT, 11)
  // Prices and pongs keep arriving; no account delta does.
  clock.advance(7_000, () => {
    probe.frames += 1
  })
  assert.equal(resyncs.length, 1)
  assert.equal(resyncs[0]!.at, 6_000)
})

test('the deadline resyncs a feed that flows but never reaches the revision', () => {
  const { clock, probe, resyncs, confirmations } = harness()
  confirmations.watch(ACCOUNT, 1_000)
  clock.advance(25_000, () => {
    probe.revision! += 1
    probe.accountDeltas += 1
    probe.frames += 1
  })
  assert.equal(resyncs.length, 1)
  assert.equal(resyncs[0]!.at, 20_000)
})

test('a projection that is no longer live hands recovery to its reconnect or resync', () => {
  const { clock, probe, resyncs, confirmations } = harness()
  confirmations.watch(ACCOUNT, 11)
  clock.advance(1_000)
  probe.live = false
  clock.advance(30_000)
  assert.deepEqual(resyncs, [])
  assert.equal(confirmations.pending(ACCOUNT), null)
})

test('one wait per account follows the highest accepted revision', () => {
  const { clock, probe, resyncs, confirmations } = harness()
  confirmations.watch(ACCOUNT, 11)
  confirmations.watch(ACCOUNT, 13)
  assert.equal(confirmations.pending(ACCOUNT), 13)
  probe.revision = 12
  probe.accountDeltas = 2
  clock.advance(3_000)
  assert.equal(confirmations.pending(ACCOUNT), 13)
  probe.revision = 13
  clock.advance(3_000)
  assert.equal(confirmations.pending(ACCOUNT), null)
  assert.deepEqual(resyncs, [])
  confirmations.watch(ACCOUNT, 20)
  confirmations.cancelAll()
  clock.advance(60_000)
  assert.deepEqual(resyncs, [])
})
