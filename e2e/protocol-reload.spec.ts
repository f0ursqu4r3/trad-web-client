import { expect, test } from './support/test'
import { BROWSER_PROTOCOL_VERSION } from '../src/lib/gateway/wire'
import { openWorkspace } from './support/workspaceWire'

// A gateway on another browser protocol refuses Authenticate with close 1008
// (lib/gateway/protocolVersion.ts). An out-of-date page reloads once, then
// asks; an older gateway is waited for.

function authenticates(log: string[]): number {
  return log.filter((kind) => kind === 'authenticate').length
}

test('an out-of-date page reloads once, then asks for a reload and stops retrying', async ({
  page,
}) => {
  let loads = 0
  page.on('load', () => (loads += 1))
  const wire = await openWorkspace(page, { refuseProtocol: () => BROWSER_PROTOCOL_VERSION + 1 })
  const notice = page.getByTestId('protocol-update')
  await expect(notice).toContainText('Trad was updated. Reloading')
  await expect.poll(() => loads, { timeout: 10_000 }).toBe(2)
  await expect(notice).toContainText('Reload this page to continue')
  await expect(notice.getByRole('button', { name: 'Reload' })).toBeVisible()
  const attempts = authenticates(wire.clientLog)
  await page.waitForTimeout(4_000)
  expect(authenticates(wire.clientLog)).toBe(attempts)
  expect(loads).toBe(2)
})

test('a reload that meets a compatible gateway connects normally', async ({ page }) => {
  let refuse = true
  const wire = await openWorkspace(page, {
    refuseProtocol: () => (refuse ? BROWSER_PROTOCOL_VERSION + 1 : null),
  })
  await expect(page.getByTestId('protocol-update')).toContainText('Reloading')
  refuse = false
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3, { timeout: 10_000 })
  await expect(page.getByTestId('protocol-update')).toHaveCount(0)
  expect(wire.accountSubscribes).toBeGreaterThan(0)
})

test('an older gateway is waited for without reloading', async ({ page }) => {
  let loads = 0
  page.on('load', () => (loads += 1))
  let refusals = 0
  await openWorkspace(page, {
    refuseProtocol: () => (refusals++ < 3 ? BROWSER_PROTOCOL_VERSION - 1 : null),
  })
  await expect(page.getByTestId('protocol-update')).toContainText("Trad's server is updating")
  await expect(page.getByTestId('managed-trade-card')).toHaveCount(3, { timeout: 15_000 })
  await expect(page.getByTestId('protocol-update')).toHaveCount(0)
  expect(loads).toBe(1)
})
