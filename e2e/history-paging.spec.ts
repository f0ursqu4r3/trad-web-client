import { expect, test, type Page } from '@playwright/test'
import type { BrowserAccountSnapshot } from '../src/lib/gateway/projection'
import { tradeWorkspaceProjection } from '../src/lib/projection/tradeWorkspace'
import { cardSummaryFields } from '../src/lib/projection/tradeSummaryShadow'
import { CLOSED_TRADE_COUNT, closedSummary, routeHistory } from './support/historyRoutes'
import { openWorkspace, type Json } from './support/workspaceWire'

// Trade-summary slice S3 on the page: older closed trades page in after the
// live cards, a trade's fills and evidence load on expand, and a coin's
// closed exposures page in the position inspector. Runs on desktop and on
// the phone projects.

// The list's scroller: the main pane on desktop, the trade list on phones.
async function scrollHistory(page: Page, to: 'end' | 'top'): Promise<void> {
  await page.getByTestId('closed-trade-history').evaluate((element, where) => {
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      if (parent.scrollHeight > parent.clientHeight) {
        parent.scrollTop = where === 'end' ? parent.scrollHeight : 0
      }
    }
  }, to)
}

async function openClosed(page: Page) {
  const workspace = page.getByTestId('trader-workspace')
  await expect(workspace.getByTestId('managed-trade-card')).toHaveCount(3)
  await workspace.getByRole('button', { name: 'Closed 0' }).click()
  return workspace
}

test('older closed trades page in on scroll, de-duplicated and virtualized', async ({ page }) => {
  const history = await routeHistory(page)
  await openWorkspace(page)
  const workspace = await openClosed(page)

  // The first page comes as soon as the list's end is on screen.
  const rows = workspace.getByTestId('closed-trade-row')
  await expect(rows.first()).toBeVisible()
  await expect(workspace.getByText('No closed trades')).toHaveCount(0)
  expect(history.trades[0]!.url.searchParams.get('state')).toBe('closed')
  expect(history.trades[0]!.url.searchParams.has('before')).toBe(false)

  const firstRow = workspace.locator(`[data-trade-id="${closedSummary(1).trade_id}"]`)
  await expect(firstRow).toContainText('+1.5 USDC')
  await expect(workspace.locator(`[data-trade-id="${closedSummary(7).trade_id}"]`)).toContainText(
    'unknown after takeover',
  )
  await expect(workspace.locator(`[data-trade-id="${closedSummary(3).trade_id}"]`)).toContainText(
    '-3.25 USDC',
  )

  // Scrolling to the end asks for the next pages with their cursors.
  // (A scroll during a load lands above the rows that load brings, so the
  // reader scrolls again, as here.)
  const finished = workspace.getByText('That is every closed trade.')
  await expect
    .poll(async () => {
      await scrollHistory(page, 'end')
      return finished.isVisible()
    })
    .toBe(true)
  expect(history.trades.map((call) => call.url.searchParams.get('before'))).toEqual([
    null,
    'p50',
    'p100',
  ])
  // The second page repeats one trade of the first: it keeps one row.
  await expect(workspace.getByRole('heading', { name: /Older closed trades/ })).toContainText(
    String(CLOSED_TRADE_COUNT),
  )
  // Blocks far above the screen keep only their height.
  await expect.poll(() => rows.count()).toBeLessThan(CLOSED_TRADE_COUNT)
  const lastRow = workspace.locator(
    `[data-trade-id="${closedSummary(CLOSED_TRADE_COUNT - 1).trade_id}"]`,
  )
  await expect(lastRow).toBeVisible()

  // Back at the top the first rows render again; the page fits the screen.
  await scrollHistory(page, 'top')
  await expect(firstRow).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  // The search narrows the paged rows by their summary fields.
  await workspace.getByRole('searchbox').fill('zec')
  await expect(rows.first()).toContainText('ZEC')
})

test('a paged trade loads its fills on expand, labelled by role', async ({ page }) => {
  const history = await routeHistory(page)
  await openWorkspace(page)
  const workspace = await openClosed(page)
  const row = workspace.locator(`[data-trade-id="${closedSummary(1).trade_id}"]`)
  await row.getByRole('button', { expanded: false }).click()

  const fills = row.getByTestId('server-fill')
  await expect(fills).toHaveCount(2)
  await expect(fills.nth(0)).toContainText('entry fill')
  await expect(fills.nth(1)).toContainText('close fill')
  expect(history.fills[0]!.url.pathname).toContain(`/trades/${closedSummary(1).trade_id}/fills`)

  await row.getByRole('button', { name: 'Load more fills' }).click()
  await expect(fills).toHaveCount(3)
  const manual = fills.nth(2)
  await expect(manual).toContainText('manual fill')
  await expect(manual).toContainText('not in the numbers')
  expect(history.fills[1]!.url.searchParams.get('after')).toBe('f2')
})

test('a live card whose fills are not all in the snapshot loads them on expand', async ({
  page,
}) => {
  const history = await routeHistory(page)
  await openWorkspace(page, {
    editSnapshot: (snapshot: Json) => {
      const typed = snapshot as unknown as BrowserAccountSnapshot
      const model = tradeWorkspaceProjection(typed)
      snapshot.trade_summaries = [...model.activeTrades, ...model.closedTrades].map((trade) => ({
        ...cardSummaryFields(trade, typed.positions),
        trade_id: trade.scopeId,
        revision: typed.checkpoint.projection_revision,
        coin_block_applies: false,
        // The server counts more fills than the snapshot holds for ETH.
        fill_count: trade.symbol === 'ETH' ? 5 : trade.executions.length,
      }))
    },
  })
  const cards = page.getByTestId('managed-trade-card')
  const btc = cards.filter({ hasText: 'BTC' })
  await btc.locator('.trade-expand').click()
  await btc.getByLabel('Trade details').getByRole('button', { name: 'history' }).click()
  await expect(btc.getByText('place chase', { exact: true })).toBeVisible()
  expect(history.fills).toHaveLength(0)

  const eth = cards.filter({ hasText: 'ETH' })
  await eth.locator('.trade-expand').click()
  await eth.getByLabel('Trade details').getByRole('button', { name: 'history' }).click()
  await expect(eth.getByTestId('server-fill')).toHaveCount(2)
  await expect(eth.getByText('place order', { exact: true })).toBeVisible()
  expect(history.fills[0]!.url.pathname).toContain('/trades/scope-filled/fills')
})

test('evidence of a trade outside the live snapshot comes from the server', async ({
  page,
  browserName,
}) => {
  const history = await routeHistory(page)
  await openWorkspace(page)
  const workspace = await openClosed(page)
  const row = workspace.locator(`[data-trade-id="${closedSummary(2).trade_id}"]`)
  await row.getByRole('button', { expanded: false }).click()
  await row.getByRole('button', { name: 'evidence', exact: true }).click()

  const evidence = row.getByTestId('trade-evidence')
  await expect(evidence).toContainText('Trade evidence')
  await expect(evidence.getByTestId('command-details')).toHaveCount(1)
  await evidence.getByRole('button', { name: 'Load more evidence' }).click()
  await expect(evidence.getByTestId('command-details')).toHaveCount(2)
  expect(history.evidence.map((call) => call.url.searchParams.get('cursor'))).toEqual([null, 'e2'])
  await expect(evidence.getByRole('button', { name: 'Load more evidence' })).toHaveCount(0)

  // Opening it again revalidates with the ETag and the 304 serves the cache.
  // (Playwright's WebKit cannot fulfill a 304; the unit tests cover it.)
  if (browserName === 'webkit') return
  await row.getByRole('button', { name: 'fills', exact: true }).click()
  await row.getByRole('button', { name: 'evidence', exact: true }).click()
  await expect(evidence.getByTestId('command-details')).toHaveCount(1)
  await expect.poll(() => history.evidence.length).toBe(3)
  expect(history.evidence[2]!.ifNoneMatch).toMatch(/^W\//)
})

test('a rate-limited page waits out Retry-After and then loads', async ({ page }) => {
  const history = await routeHistory(page)
  history.rateLimit('trades', 1, 1)
  await openWorkspace(page)
  const workspace = await openClosed(page)
  await expect(workspace.getByText(/slow down; retrying in 1 s/)).toBeVisible()
  await expect(workspace.getByTestId('closed-trade-row').first()).toBeVisible({ timeout: 6_000 })
  expect(history.trades).toHaveLength(2)
  const [limited, retried] = history.trades
  expect(retried!.url.search).toBe(limited!.url.search)
})

test('position inspector pages closed exposures from the server', async ({ page }) => {
  const history = await routeHistory(page)
  await page.route('**/auth/session', (route) => route.fulfill({ json: { authenticated: false } }))
  await page.goto('/e2e/engine-projection')
  const fixture = page.getByTestId('engine-projection-fixture')
  await fixture.getByRole('button', { name: 'Inspect account positions' }).click()
  const inspector = page.getByTestId('account-position-inspector')
  const eth = inspector.locator('[data-symbol="ETH"]')

  await eth.getByRole('button', { name: 'show closed' }).click()
  const closed = eth.getByTestId('closed-exposure')
  await expect(closed).toHaveCount(2)
  await expect(eth.getByRole('button', { name: 'hide closed (3)' })).toBeVisible()
  await eth.getByRole('button', { name: 'Load more exposures' }).click()
  await expect(closed).toHaveCount(3)
  expect(history.exposures.map((call) => call.url.searchParams.get('before'))).toEqual([null, 'x2'])
  expect(history.exposures[0]!.url.pathname).toContain('/positions/ETH/exposures')
})
