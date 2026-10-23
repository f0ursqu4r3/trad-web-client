import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { normalized } from './support/resumeServer'
import { openWorkspace, type Json, type WorkspaceOptions } from './support/workspaceWire'

// Browser protocol 17 (networking items 19 and 21): a message over the
// frame cap arrives in parts and applies only once whole; a drop or a lost
// part mid-transfer falls back to the normal snapshot path; prices keep
// applying while a transfer is under way; deltas sent as patches leave the
// page where whole deltas would.

interface Probe {
  status: string
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

// The market store's applied window end for a coin.
async function nextSequence(page: Page, symbol: string): Promise<number | null> {
  return page.evaluate((wanted) => {
    interface Streams {
      [key: string]: { symbol: string; nextSequence: number | null }
    }
    const root = document.querySelector('#app') as unknown as {
      __vue_app__: {
        config: {
          globalProperties: { $pinia: { state: { value: { market: { streams: Streams } } } } }
        }
      }
    }
    const streams = root.__vue_app__.config.globalProperties.$pinia.state.value.market.streams
    return Object.values(streams).find((stream) => stream.symbol === wanted)?.nextSequence ?? null
  }, symbol)
}

// The page holds what a page given the account whole holds.
async function expectSameAsWhole(page: Page, options: WorkspaceOptions = {}): Promise<void> {
  const reference = await page.context().newPage()
  await openWorkspace(reference, options)
  await expect(reference.getByTestId('managed-trade-card')).toHaveCount(3)
  const [parted, whole] = await Promise.all([probe(page), probe(reference)])
  expect(parted!.status).toBe('ready')
  expect(normalized(parted!.live)).toEqual(normalized(whole!.live))
  await reference.close()
}

test('a snapshot in parts applies once whole', async ({ page }) => {
  const wire = await openWorkspace(page, { parts: { bytes: 2_048 } })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  expect(wire.parts.completed).toBe(1)
  expect(wire.parts.parts).toBeGreaterThan(5)
  expect(wire.received.account_snapshot?.messages).toBe(1)
  await expect(page.getByTestId('workspace-stale')).toHaveCount(0)
  await expectSameAsWhole(page)
})

test('a drop mid-transfer recovers on the next socket', async ({ page }) => {
  const wire = await openWorkspace(page, {
    parts: { bytes: 2_048, gapMs: 5, dropAfterParts: 3 },
  })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3, { timeout: 15_000 })
  // the page authenticated a new socket after its first subscribe
  const afterSubscribe = wire.clientLog.slice(wire.clientLog.indexOf('subscribe_account'))
  expect(afterSubscribe).toContain('authenticate')
  expect(wire.parts.transfers).toBe(2)
  expect(wire.parts.completed).toBe(1)
  await expectSameAsWhole(page)
})

test('a lost part asks for the account again on the same socket', async ({ page }) => {
  const wire = await openWorkspace(page, { parts: { bytes: 2_048, skipPart: 2 } })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3, { timeout: 15_000 })
  const afterSubscribe = wire.clientLog.slice(wire.clientLog.indexOf('subscribe_account'))
  expect(afterSubscribe).not.toContain('authenticate')
  expect(afterSubscribe.filter((kind) => kind.endsWith('_account'))).toEqual([
    'subscribe_account',
    'unsubscribe_account',
    'subscribe_account',
  ])
  expect(wire.parts.completed).toBe(2)
  await expectSameAsWhole(page)
})

test('prices keep applying while a snapshot is in transfer', async ({ page }) => {
  const wire = await openWorkspace(page, { parts: { bytes: 512, gapMs: 60 } })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3, { timeout: 20_000 })
  await expect.poll(() => wire.markets.has('ETH')).toBe(true)

  // a reconnect: the markets resubscribe first, then the account comes in
  // parts, slowly, as on a phone
  await wire.dropSocket()
  await expect.poll(() => wire.subscribes.filter((symbol) => symbol === 'ETH').length).toBe(2)
  await expect.poll(() => wire.parts.inProgress).toBe(true)
  expect(wire.parts.transfers).toBe(2)
  const applied = (await nextSequence(page, 'ETH'))!
  for (let round = 1; round <= 3; round += 1) {
    expect(wire.sendSamples('ETH', 2)).toBe(true)
    await expect.poll(() => nextSequence(page, 'ETH')).toBe(applied + round * 2)
  }
  // all of that while the account was still arriving
  expect(wire.parts.inProgress).toBe(true)
  expect(wire.parts.completed).toBe(1)

  await expect.poll(() => wire.parts.completed, { timeout: 20_000 }).toBe(2)
  await expect(page.getByTestId('workspace-stale')).toHaveCount(0)
  expect((await probe(page))!.status).toBe('ready')
})

test('deltas sent as patches leave the page where whole deltas do', async ({ page }) => {
  const wire = await openWorkspace(page, { patches: true })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  const reference = await page.context().newPage()
  const whole = await openWorkspace(reference)
  await expect(reference.getByTestId('managed-trade-card')).toHaveCount(3)
  const start = (await revision(page))!
  for (let count = 0; count < 4; count += 1) {
    wire.sendDelta()
    whole.sendDelta()
  }
  await expect.poll(() => revision(page)).toBe(start + 4)
  await expect.poll(() => revision(reference)).toBe(start + 4)
  expect(wire.received.account_patch?.messages).toBe(4)
  // a patch carries only what changed
  expect(wire.received.account_patch!.bytes).toBeLessThan(whole.received.account_delta!.bytes / 2)
  const [patched, reference_] = await Promise.all([probe(page), probe(reference)])
  expect(normalized(patched!.live)).toEqual(normalized(reference_!.live))
  await reference.close()
})
