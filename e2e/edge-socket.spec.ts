import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { BROWSER_PROTOCOL_VERSION } from '../src/lib/gateway/wire'
import { routeHistory } from './support/historyRoutes'
import { openWorkspace, type Json } from './support/workspaceWire'

// Cell edges (backend multi-user-readiness S5): the ticket response names
// the socket path. A user with a cell connects to their edge on
// /ws/<cell> and reads history pages there with the ticket's history pass;
// everyone else stays on /ws with the session cookie, and so does a page
// whose gateway sends no ws_url. Runs on desktop and the phone projects.

const CELL_TICKET: Json = {
  token: 'fixture-cell-ticket',
  expires_in: 30,
  ws_url: '/ws/krio',
  history_url: '/ws/krio/api',
  history_token: 'h1.1.fixture-pass.signature',
}

// The distinct paths the page opened sockets on (the workspace may open
// and replace its first socket while it starts).
function socketPaths(urls: string[]): string[] {
  return [...new Set(urls.map((url) => new URL(url).pathname))]
}

async function openClosed(page: Page) {
  const workspace = page.getByTestId('trader-workspace')
  await expect(workspace.getByTestId('managed-trade-card')).toHaveCount(3)
  await workspace.getByRole('button', { name: 'Closed 0' }).click()
  await expect(workspace.getByTestId('closed-trade-row').first()).toBeVisible()
}

async function revision(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __tradProjectionProbe?: () => { live: Json } | null
        }
      ).__tradProjectionProbe?.()?.live.checkpoint.projection_revision ?? null,
  )
}

test('a user with a cell trades on /ws/<cell> and reads history from that edge', async ({
  page,
}) => {
  const history = await routeHistory(page)
  const wire = await openWorkspace(page, { ticket: CELL_TICKET })
  await openClosed(page)

  expect(socketPaths(wire.socketUrls)).toEqual(['/ws/krio'])
  const first = history.trades[0]!
  expect(first.url.pathname).toMatch(/^\/ws\/krio\/api\/accounts\/[^/]+\/trades$/)
  expect(first.authorization).toBe(`Bearer ${CELL_TICKET.history_token}`)
})

for (const [name, ticket] of [
  ['a user without a cell', { token: 'fixture-ticket', expires_in: 30, ws_url: '/ws' }],
  ['a gateway that sends no ws_url', { token: 'fixture-ticket', expires_in: 30 }],
] as const) {
  test(`${name}: the socket stays on /ws and history uses the cookie`, async ({ page }) => {
    const history = await routeHistory(page)
    const wire = await openWorkspace(page, { ticket })
    await openClosed(page)
    expect(socketPaths(wire.socketUrls)).toEqual(['/ws'])
    expect(history.trades[0]!.url.pathname).toMatch(/^\/api\/accounts\/[^/]+\/trades$/)
    expect(history.trades[0]!.authorization).toBeNull()
  })
}

test('a cell socket renews its lease and resumes after a drop on /ws/<cell>', async ({ page }) => {
  const wire = await openWorkspace(page, { ticket: CELL_TICKET, resume: true, leaseMs: 4_000 })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)

  // the planned renewal opens its new socket on the cell path, and resumes
  const opened = wire.socketsOpened
  wire.sendDelta()
  await expect.poll(() => wire.socketsOpened, { timeout: 10_000 }).toBe(opened + 1)
  const resumed = () => wire.received.account_resumed?.messages ?? 0
  await expect.poll(resumed).toBe(1)
  expect(wire.received.account_snapshot?.messages).toBe(1)

  // a drop: back on the cell path with only the missed deltas
  wire.sendDelta()
  await expect.poll(() => revision(page)).toBe(wire.resume!.revision())
  const before = (await revision(page))!
  await wire.dropSocket()
  wire.commitDelta()
  await expect.poll(() => revision(page), { timeout: 10_000 }).toBe(before + 1)
  expect(resumed()).toBe(2)
  expect(wire.received.account_snapshot?.messages).toBe(1)
  expect(socketPaths(wire.socketUrls)).toEqual(['/ws/krio'])
  expect(wire.socketUrls.length).toBeGreaterThanOrEqual(opened + 2)
})

test('a cell socket takes a snapshot in parts', async ({ page }) => {
  const wire = await openWorkspace(page, { ticket: CELL_TICKET, parts: { bytes: 2_048 } })
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3)
  expect(wire.parts.completed).toBe(1)
  expect(wire.parts.parts).toBeGreaterThan(5)
  expect(socketPaths(wire.socketUrls)).toEqual(['/ws/krio'])
})

test('an edge on another protocol reloads the page as /ws does', async ({ page }) => {
  let loads = 0
  page.on('load', () => (loads += 1))
  let refuse = true
  const wire = await openWorkspace(page, {
    ticket: CELL_TICKET,
    refuseProtocol: () => (refuse ? BROWSER_PROTOCOL_VERSION + 1 : null),
  })
  await expect(page.getByTestId('protocol-update')).toContainText('Reloading')
  refuse = false
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3, { timeout: 10_000 })
  expect(loads).toBe(2)
  expect(socketPaths(wire.socketUrls)).toEqual(['/ws/krio'])
})
