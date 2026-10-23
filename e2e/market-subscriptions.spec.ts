import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { openWorkspace, WORKSPACE_ACCOUNT_ID } from './support/workspaceWire'

// Card price subscriptions on a scripted gateway (networking work item 7):
// a stalled subscribe times out and retries, the gateway's capacity refusal
// is retried, cards stay mounted (marked stale) through a resync, and a new
// connection subscribes the last known card coins before the snapshot.

const CAPACITY_ERROR = {
  kind: 'unavailable',
  reason: 'market subscription capacity or duplicate account/symbol subscription reached',
  retryable: false,
}

function card(page: Page, symbol: string) {
  return page.getByTestId('managed-trade-card').filter({ hasText: symbol }).first()
}

function count(values: string[], value: string): number {
  return values.filter((candidate) => candidate === value).length
}

test('an unanswered price subscription times out, retries, and drops the late answer', async ({
  page,
}) => {
  await page.clock.install()
  const wire = await openWorkspace(page, {
    holdMarket: (symbol, attempt) => symbol === 'ETH' && attempt === 1,
  })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect.poll(() => wire.heldMarkets.length).toBe(1)
  const eth = card(page, 'ETH').locator('.metric-pnl')
  await expect(eth).toContainText('waiting for price')

  await page.clock.fastForward(10_500)
  await expect(eth).toContainText('feed unavailable')
  await page.clock.fastForward(1_500)
  await expect.poll(() => count(wire.subscribes, 'ETH')).toBe(2)
  await expect(eth).not.toContainText('feed unavailable')
  await expect(eth).not.toContainText('waiting for price')

  // The first request's answer arrives after the retry already succeeded.
  wire.answerMarket(wire.heldMarkets[0]!)
  await expect.poll(() => count(wire.unsubscribes, 'ETH')).toBe(1)
  await expect(eth).not.toContainText('feed unavailable')
})

test('the gateway capacity refusal is retried until a slot frees', async ({ page }) => {
  let refusals = 0
  const wire = await openWorkspace(page, {
    marketError: (symbol) => (symbol === 'SOL' && refusals++ < 1 ? CAPACITY_ERROR : null),
  })
  const sol = card(page, 'SOL').locator('.metric-pnl')
  await expect.poll(() => count(wire.subscribes, 'SOL'), { timeout: 10_000 }).toBe(2)
  await expect(sol).not.toContainText('feed unavailable')
  await expect(sol).not.toContainText('waiting for price')
})

test('cards stay mounted and marked stale through a resync; prices resubscribe first', async ({
  page,
}) => {
  const wire = await openWorkspace(page)
  const cards = page.getByTestId('managed-trade-card')
  await expect(cards).toHaveCount(3)
  const eth = card(page, 'ETH')
  await expect(eth.locator('.metric-pnl')).not.toContainText('waiting for price')
  await eth.evaluate((element) => element.setAttribute('data-original-card', 'yes'))

  wire.holdSnapshots()
  const logBefore = wire.clientLog.length
  await wire.dropSocket()
  const stale = page.getByTestId('workspace-stale')
  await expect(stale).toBeVisible()
  await expect(stale).toContainText('Resyncing account')
  await expect(cards).toHaveCount(3)
  await expect(eth.locator('.pill-stale')).toBeVisible()
  // Open P&L is not computed from quantities that may be out of date.
  await expect(eth.locator('.metric-pnl')).toContainText('resyncing')
  await expect(eth.locator('.metric-pnl')).not.toContainText('Gross open')

  // The new socket asks for every card price before the account snapshot.
  await expect
    .poll(() => wire.clientLog.slice(logBefore).filter((kind) => kind === 'subscribe_account'))
    .toHaveLength(1)
  const after = wire.clientLog.slice(logBefore)
  const accountAt = after.indexOf('subscribe_account')
  for (const symbol of ['BTC', 'ETH', 'SOL']) {
    const at = after.indexOf(`subscribe_market:${symbol}`)
    expect(at, symbol).toBeGreaterThanOrEqual(0)
    expect(at, symbol).toBeLessThan(accountAt)
  }

  wire.releaseSnapshots()
  await expect(stale).toHaveCount(0)
  await expect(eth.locator('.pill-stale')).toHaveCount(0)
  await expect(eth.locator('.metric-pnl')).toContainText('Gross open')
  await expect(page.locator('[data-original-card="yes"]')).toHaveCount(1)
})

test('a new page load subscribes the remembered card prices before its snapshot', async ({
  page,
}) => {
  const wire = await openWorkspace(page)
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect
    .poll(() =>
      page.evaluate(
        (accountId) => localStorage.getItem(`trad:card-markets:${accountId}`),
        WORKSPACE_ACCOUNT_ID,
      ),
    )
    .not.toBeNull()
  const remembered = JSON.parse(
    (await page.evaluate(
      (accountId) => localStorage.getItem(`trad:card-markets:${accountId}`),
      WORKSPACE_ACCOUNT_ID,
    )) ?? '[]',
  ) as string[]
  expect([...remembered].sort()).toEqual(['BTC', 'ETH', 'SOL'])

  wire.holdSnapshots()
  const subscribesBefore = wire.subscribes.length
  const unsubscribesBefore = wire.unsubscribes.length
  await page.reload()
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(0)
  await expect
    .poll(() => [...new Set(wire.subscribes.slice(subscribesBefore))].sort())
    .toEqual(['BTC', 'ETH', 'SOL'])

  wire.releaseSnapshots()
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect(card(page, 'ETH').locator('.metric-pnl')).toContainText('Gross open')
  // The held demands hand over to the mounted cards without a resubscribe.
  await page.waitForTimeout(2_800)
  const subscribed = wire.subscribes.slice(subscribesBefore)
  for (const symbol of ['BTC', 'ETH', 'SOL']) expect(count(subscribed, symbol), symbol).toBe(1)
  expect(wire.unsubscribes.slice(unsubscribesBefore)).toEqual([])
})

test('a lease renewal closes the replaced socket instead of streaming on both', async ({
  page,
}) => {
  // A 4 s lease renews about 1 s before it ends.
  const wire = await openWorkspace(page, { leaseMs: 4_000 })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  await expect(card(page, 'ETH').locator('.metric-pnl')).toContainText('Gross open')
  const opened = wire.socketsOpened
  const closed = wire.socketsClosed
  const accountSubscribes = wire.accountSubscribes
  await expect.poll(() => wire.socketsOpened, { timeout: 10_000 }).toBe(opened + 1)
  // Nothing was waiting for a reply on the old socket, so it closes at once
  // rather than after the 35 s grace.
  await expect.poll(() => wire.socketsClosed, { timeout: 2_000 }).toBe(closed + 1)
  await expect.poll(() => wire.accountSubscribes).toBe(accountSubscribes + 1)
  await expect(page.getByTestId('workspace-stale')).toHaveCount(0)
  await expect(card(page, 'ETH').locator('.metric-pnl')).toContainText('Gross open')
})
