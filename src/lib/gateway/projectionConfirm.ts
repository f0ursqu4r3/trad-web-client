import type { Timers } from './marketSubscriptionPolicy.ts'

// Waiting for an accepted command's revision to appear in the account
// projection (networking work item 8). It used to resnapshot after 3 s; on a
// slow link the delta is often still in transit then, and the multi-MB
// resnapshot queued behind it made the next confirmation late too.
//
// Now the wait is checked at 3, 6, 12 and 20 s after acceptance:
// - the revision arrived: confirmed;
// - the projection is not live (reconnecting, resyncing, another account):
//   stop; that recovery brings a fresh snapshot anyway;
// - the revision advanced or account deltas arrived since the last check:
//   the feed is flowing and the delta is coming; keep waiting;
// - the socket delivered other frames but the account feed stayed silent
//   for two checks in a row: the account feed is stuck; resync;
// - nothing arrived at all: the link is stalled and a resnapshot would only
//   queue behind it; keep waiting;
// - 20 s without the revision: resync.
// A real gap (a delta the projection rejects) still resyncs at once, on the
// delta path.

export const PROJECTION_CONFIRM_CHECKS_MS = [3_000, 6_000, 12_000, 20_000] as const

export interface ProjectionProbe {
  // The projection is ready on a ready socket and still the selected account.
  live: boolean
  revision: number | null
  // Monotonic counters: account deltas applied, and frames received.
  accountDeltas: number
  frames: number
}

export type ProjectionConfirmDecision = 'confirmed' | 'abandon' | 'wait' | 'resync'

interface Watch {
  accountId: string
  expected: number
  startedAt: number
  check: number
  timer: number
  revision: number | null
  accountDeltas: number
  frames: number
  quietChecks: number
}

export function projectionConfirmDecision(
  expected: number,
  last: { revision: number | null; accountDeltas: number; frames: number; quietChecks: number },
  probe: ProjectionProbe,
  finalCheck: boolean,
): ProjectionConfirmDecision {
  if (probe.revision !== null && probe.revision >= expected) return 'confirmed'
  if (!probe.live || probe.revision === null) return 'abandon'
  if (finalCheck) return 'resync'
  const advanced = last.revision === null || probe.revision > last.revision
  if (advanced || probe.accountDeltas > last.accountDeltas) return 'wait'
  if (probe.frames > last.frames && last.quietChecks >= 1) return 'resync'
  return 'wait'
}

export class ProjectionConfirmations {
  private readonly watches = new Map<string, Watch>()
  private readonly clock: Timers
  private readonly now: () => number
  private readonly probe: (accountId: string) => ProjectionProbe
  private readonly resync: (accountId: string, reason: string) => void

  constructor(
    clock: Timers,
    now: () => number,
    probe: (accountId: string) => ProjectionProbe,
    resync: (accountId: string, reason: string) => void,
  ) {
    this.clock = clock
    this.now = now
    this.probe = probe
    this.resync = resync
  }

  // One wait per account; a later command raises the revision it waits for.
  watch(accountId: string, expectedRevision: number): void {
    const existing = this.watches.get(accountId)
    if (existing !== undefined) {
      existing.expected = Math.max(existing.expected, expectedRevision)
      return
    }
    const probe = this.probe(accountId)
    const watch: Watch = {
      accountId,
      expected: expectedRevision,
      startedAt: this.now(),
      check: 0,
      timer: 0,
      revision: probe.revision,
      accountDeltas: probe.accountDeltas,
      frames: probe.frames,
      quietChecks: 0,
    }
    this.watches.set(accountId, watch)
    this.schedule(watch)
  }

  pending(accountId: string): number | null {
    return this.watches.get(accountId)?.expected ?? null
  }

  cancelAll(): void {
    for (const watch of this.watches.values()) this.clock.clear(watch.timer)
    this.watches.clear()
  }

  private schedule(watch: Watch): void {
    const at = PROJECTION_CONFIRM_CHECKS_MS[watch.check]!
    const delay = Math.max(0, watch.startedAt + at - this.now())
    watch.timer = this.clock.set(() => this.runCheck(watch), delay)
  }

  private runCheck(watch: Watch): void {
    if (this.watches.get(watch.accountId) !== watch) return
    const probe = this.probe(watch.accountId)
    const finalCheck = watch.check >= PROJECTION_CONFIRM_CHECKS_MS.length - 1
    const decision = projectionConfirmDecision(watch.expected, watch, probe, finalCheck)
    if (decision === 'wait') {
      const quiet = probe.revision === watch.revision && probe.accountDeltas === watch.accountDeltas
      watch.quietChecks = quiet && probe.frames > watch.frames ? watch.quietChecks + 1 : 0
      watch.revision = probe.revision
      watch.accountDeltas = probe.accountDeltas
      watch.frames = probe.frames
      watch.check += 1
      this.schedule(watch)
      return
    }
    this.watches.delete(watch.accountId)
    if (decision !== 'resync') return
    const waited = Math.round((this.now() - watch.startedAt) / 1_000)
    this.resync(
      watch.accountId,
      `accepted command revision ${watch.expected} was not observed after ${waited}s; current revision is ${probe.revision ?? 'unavailable'}`,
    )
  }
}
