import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

// The terminal warns from seven days before a Hyperliquid agent wallet
// expires (the workspace fixture sets agent_valid_until_ms).

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

async function openFixtureWorkspace(page: Page, agentValidForMs: number | null) {
  await page.route('https://api.hyperliquid.xyz/info', (route) =>
    route.fulfill({ json: { universe: [{ name: 'BTC', szDecimals: 5 }] } }),
  )
  await page.route('**/auth/session', (route) => route.fulfill({ json: { authenticated: false } }))
  const query = agentValidForMs === null ? '' : `?agent_valid_for_ms=${agentValidForMs}`
  await page.goto(`/e2e/trader-workspace${query}`)
  await expect(page.getByTestId('trader-workspace')).toBeVisible()
}

test('no agent expiry warning outside the seven-day window', async ({ page }) => {
  await openFixtureWorkspace(page, 8 * DAY)
  await expect(page.getByTestId('agent-expiry')).toHaveCount(0)
  await page.goto('/e2e/trader-workspace')
  await expect(page.getByTestId('trader-workspace')).toBeVisible()
  await expect(page.getByTestId('agent-expiry')).toHaveCount(0)
})

test('the terminal warns of agent expiry from seven days and links to approval', async ({
  page,
}) => {
  await openFixtureWorkspace(page, 5 * DAY + HOUR)
  const notice = page.getByTestId('agent-expiry').getByRole('status')
  await expect(notice).toHaveAttribute('data-state', 'expiring_soon')
  await expect(notice).toContainText('Krio demo: agent wallet expires in 5 days')
  await expect(notice).toContainText(
    'From 24 hours before it expires, Trad refuses new trades on this account',
  )
  await expect(notice).toContainText('closes keep working until it expires')
  const link = notice.getByRole('link', { name: 'Renew agent' })
  await expect(link).toHaveAttribute('href', /\/settings\/accounts\/[^/]+\/authorization\?renew=1$/)
  await page.screenshot({ path: 'test-results/agent-expiry-warning.png' })
})

test('inside 24 hours the warning says new trades are refused', async ({ page }) => {
  await openFixtureWorkspace(page, 6 * HOUR + 10 * 60_000)
  const notice = page.getByTestId('agent-expiry').getByRole('alert')
  await expect(notice).toHaveAttribute('data-state', 'new_risk_blocked')
  await expect(notice).toContainText('Krio demo: new trades are refused')
  await expect(notice).toContainText('expires in 6 hours')
  await expect(notice).toContainText('Closes keep working until it expires')
  await page.screenshot({ path: 'test-results/agent-expiry-blocked.png' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(notice.getByRole('link', { name: 'Renew agent' })).toBeVisible()
  await page.screenshot({ path: 'test-results/agent-expiry-blocked-phone.png' })
})
