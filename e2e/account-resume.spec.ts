import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { normalized } from './support/resumeServer'
import { openWorkspace, type Json, type WorkspaceWire } from './support/workspaceWire'

// Resume (networking work item 11, browser protocol 16): a tab that drops
// and comes back within the gateway's ring gets only the deltas it missed,
// in a few KB; a long drop, another stream (a Gateway or node restart, an
// upstream resync) or a resume that does not apply gets the snapshot. The
// resumed tab must hold exactly what a tab with a fresh snapshot holds, and
// never a part of a resume.

// Decision 5's budget for a resume after a short drop.
const RESUME_BUDGET_BYTES = 10_000

interface Probe {
  status: string
  streamId: string | null
  live: Json
}

function probe(page: Page): Promise<Probe | null> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __tradProjectionProbe?: () => Probe | null }
      ).__tradProjectionProbe?.() ?? null,
  )
}

async function revision(page: Page): Promise<number | null> {
  return (await probe(page))?.live.checkpoint.projection_revision ?? null
}

// Opens the workspace on a resuming gateway and applies two live deltas.
async function resumingWorkspace(page: Page): Promise<WorkspaceWire> {
  const wire = await openWorkspace(page, { resume: true })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect.poll(async () => (await probe(page))?.streamId).toBe(wire.resume!.streamId)
  wire.sendDelta()
  wire.sendDelta()
  await expect.poll(() => revision(page)).toBe(wire.resume!.revision())
  return wire
}

// What the page received of `kind`.
function received(wire: WorkspaceWire, kind: string): { messages: number; bytes: number } {
  return wire.received[kind] ?? { messages: 0, bytes: 0 }
}

// The resumed page holds what a page opened fresh on the gateway's current
// account holds.
async function expectSameAsFresh(page: Page, wire: WorkspaceWire): Promise<void> {
  const fresh = await page.context().newPage()
  await openWorkspace(fresh, { snapshot: structuredClone(wire.resume!.current) })
  await expect.poll(() => revision(fresh)).toBe(wire.resume!.revision())
  const [resumed, reference] = await Promise.all([probe(page), probe(fresh)])
  expect(normalized(resumed!.live)).toEqual(normalized(reference!.live))
  await fresh.close()
}

test('a short drop resumes with only the missed deltas, in a few KB', async ({ page }) => {
  const wire = await resumingWorkspace(page)
  const before = (await revision(page))!

  // two deltas happen while the socket is down
  await wire.dropSocket()
  wire.commitDelta()
  wire.commitDelta()
  await expect.poll(() => revision(page), { timeout: 10_000 }).toBe(before + 2)

  const resubscribe = wire.accountSubscribeLog.at(-1)!
  expect(resubscribe.resume_from_revision).toEqual({
    stream_id: wire.resume!.streamId,
    projection_revision: before,
  })
  // the missed deltas and a small envelope, nothing else
  const resumed = received(wire, 'account_resumed')
  const missed = wire.resume!.deltasAfter(before)
  expect(resumed.messages).toBe(1)
  expect(resumed.bytes).toBeLessThan(RESUME_BUDGET_BYTES)
  expect(resumed.bytes).toBeLessThan(Buffer.byteLength(JSON.stringify(missed)) + 400)
  expect(received(wire, 'account_snapshot').messages).toBe(1)
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect(page.getByTestId('workspace-stale')).toHaveCount(0)
  expect((await probe(page))!.status).toBe('ready')

  // live deltas follow the resume
  wire.sendDelta()
  await expect.poll(() => revision(page)).toBe(before + 3)
  await expectSameAsFresh(page, wire)
})

test('a long drop gets the snapshot', async ({ page }) => {
  const wire = await resumingWorkspace(page)
  const before = (await revision(page))!

  await wire.dropSocket()
  wire.commitDelta()
  wire.resume!.evict()
  wire.commitDelta()
  await expect.poll(() => revision(page), { timeout: 10_000 }).toBe(before + 2)

  expect(wire.accountSubscribeLog.at(-1)!.resume_from_revision?.projection_revision).toBe(before)
  expect(received(wire, 'account_resumed').messages).toBe(0)
  expect(received(wire, 'account_snapshot').messages).toBe(2)
  await expectSameAsFresh(page, wire)
})

test('another stream snapshots, and so does a resume that does not apply', async ({ page }) => {
  const wire = await resumingWorkspace(page)
  const before = (await revision(page))!

  // a Gateway or node restart: the stream the page knows is gone
  await wire.dropSocket()
  wire.resume!.newStream()
  wire.commitDelta()
  await expect.poll(() => revision(page), { timeout: 10_000 }).toBe(before + 1)
  expect(received(wire, 'account_snapshot').messages).toBe(2)
  await expect.poll(async () => (await probe(page))?.streamId).toBe(wire.resume!.streamId)

  // a resume with a hole is not installed; the page asks for a snapshot
  await wire.dropSocket()
  wire.resume!.breakNextResume()
  wire.commitDelta()
  wire.commitDelta()
  await expect.poll(() => received(wire, 'account_snapshot').messages, { timeout: 10_000 }).toBe(3)
  expect(received(wire, 'account_resumed').messages).toBe(1)
  const [broken, fallback] = wire.accountSubscribeLog.slice(-2)
  expect(broken!.resume_from_revision?.projection_revision).toBe(before + 1)
  expect(fallback!.resume_from_revision).toBeUndefined()
  await expect.poll(() => revision(page)).toBe(before + 3)
  await expectSameAsFresh(page, wire)
})

test('a lease renewal resumes without a snapshot', async ({ page }) => {
  const wire = await openWorkspace(page, { resume: true, leaseMs: 4_000 })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  wire.sendDelta()
  await expect.poll(() => wire.socketsOpened, { timeout: 10_000 }).toBe(2)
  await expect.poll(() => received(wire, 'account_resumed').messages).toBe(1)
  expect(received(wire, 'account_snapshot').messages).toBe(1)
  wire.sendDelta()
  await expect.poll(() => revision(page)).toBe(wire.resume!.revision())
  await expectSameAsFresh(page, wire)
})

test('a gateway without stream ids is never asked to resume', async ({ page }) => {
  const wire = await openWorkspace(page)
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await wire.dropSocket()
  await expect.poll(() => wire.accountSubscribes, { timeout: 10_000 }).toBe(2)
  for (const subscribe of wire.accountSubscribeLog) {
    expect(subscribe.resume_from_revision).toBeUndefined()
  }
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
})
