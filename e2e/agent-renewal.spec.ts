import type { Page, Route } from '@playwright/test'
import { expect, test } from './support/test'
import { mockGateway } from './support/mockGateway'

// Renewing an approved Hyperliquid agent from the account's authorization
// page, against mocked renewal routes and a mocked browser wallet.

const ACCOUNT_ID = '40000000-0000-4000-8000-000000000001'
const CREDENTIAL_ID = '40000000-0000-4000-8000-0000000000c1'
const WALLET = '0x1111111111111111111111111111111111111111'
const ACTIVE = '0x2222222222222222222222222222222222222222'
const REPLACEMENT = '0x3333333333333333333333333333333333333333'
const DAY = 24 * 60 * 60 * 1000
const BASE = `**/api/hyperliquid/agent-wallets/${CREDENTIAL_ID}/renewal`

type Json = Record<string, unknown>
interface Pending {
  agent_name: string
  agent_address: string
  started_at: string
}
interface RenewalGateway {
  pending: Pending | null
  validUntilMs: number
  accountFetches: number
  starts: Json[]
  approvals: Json[]
  verifies: number
  cancels: number
  // Answers queued per route; an empty queue answers the default.
  startReplies: Array<{ status: number; json: Json }>
  approvalReplies: Array<{ status: number; json: Json }>
  verifyReplies: Array<{ status: number; json: Json }>
}

function refusal(code: string, error = `refused: ${code}`) {
  return { status: 409, json: { error, code } }
}

function awaiting(pending: Pending) {
  return {
    state: 'awaiting_approval',
    credential_id: CREDENTIAL_ID,
    network: 'mainnet',
    user_address: WALLET,
    active_agent_name: 'trad',
    active_agent_address: ACTIVE,
    active_valid_until_ms: null,
    renewal: pending,
  }
}

async function openAuthorization(
  page: Page,
  options: { pending?: Pending | null; validForMs?: number; query?: string } = {},
) {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await mockGateway(page, { authenticated: true })
  const gw: RenewalGateway = {
    pending: options.pending ?? null,
    validUntilMs: Date.now() + (options.validForMs ?? 3 * DAY),
    accountFetches: 0,
    starts: [],
    approvals: [],
    verifies: 0,
    cancels: 0,
    startReplies: [],
    approvalReplies: [],
    verifyReplies: [],
  }
  const account = () => ({
    id: ACCOUNT_ID,
    label: 'Main',
    key: 'fixture',
    exchange: 'hyperliquid',
    network: 'mainnet',
    exchange_metadata: {
      product: 'usdc_perp',
      user_address: WALLET,
      agent_address: gw.pending === null && gw.approvals.length > 0 ? REPLACEMENT : ACTIVE,
      agent_approved: true,
      agent_approval_verified_at_ms: 1,
      agent_valid_until_ms: gw.validUntilMs,
      builder_target_total_tenths_bps: 0,
    },
  })
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        email: 'trader@example.com',
        user_id: '40000000-0000-4000-8000-0000000000aa',
        entitled: true,
        enabled: true,
        role: 'user',
        capabilities: [],
        client_profile: { display_name: null, meta: { preferences: {} } },
        accounts: [account()],
      },
    }),
  )
  await page.route('**/api/accounts', (route) => {
    gw.accountFetches += 1
    return route.fulfill({ json: [account()] })
  })
  await page.route('**/api/hyperliquid/agent-wallets', (route) =>
    route.fulfill({
      json: [
        {
          credential_id: CREDENTIAL_ID,
          network: 'mainnet',
          user_address: WALLET,
          agent_name: 'trad',
          agent_address: ACTIVE,
          approved: true,
          approval_verified_at_ms: 1,
          valid_until_ms: gw.validUntilMs,
          attached_accounts: 1,
          preferred_name: 'trad',
          remote_agents: [
            { name: 'trad', address: ACTIVE, valid_until: gw.validUntilMs },
            { name: 'bot', address: '0x4444444444444444444444444444444444444444' },
            { name: 'phone', address: '0x5555555555555555555555555555555555555555' },
          ],
          renewal: gw.pending,
        },
      ],
    }),
  )
  const reply = async (route: Route, queue: RenewalGateway['startReplies'], fallback: Json) => {
    const next = queue.shift()
    await route.fulfill(next ?? { status: 200, json: fallback })
  }
  const switched = () => {
    gw.pending = null
    gw.validUntilMs = Date.now() + 90 * DAY
    return {
      state: 'switched',
      credential: {
        credential_id: CREDENTIAL_ID,
        agent_name: 'trad-2',
        agent_address: REPLACEMENT,
        valid_until_ms: gw.validUntilMs,
      },
      attached_accounts: 1,
    }
  }
  await page.route(BASE, async (route) => {
    if (route.request().method() === 'DELETE') {
      gw.cancels += 1
      gw.pending = null
      return route.fulfill({ status: 204, body: '' })
    }
    const body = (route.request().postDataJSON() ?? {}) as Json
    gw.starts.push(body)
    const queued = gw.startReplies.shift()
    if (queued) return route.fulfill(queued)
    gw.pending ??= {
      agent_name: typeof body.agent_name === 'string' ? body.agent_name : 'trad-2',
      agent_address: REPLACEMENT,
      started_at: '2026-10-23T13:00:00Z',
    }
    return route.fulfill({ status: 201, json: awaiting(gw.pending) })
  })
  await page.route(`${BASE}/approval`, async (route) => {
    gw.approvals.push(route.request().postDataJSON() as Json)
    if (gw.approvalReplies.length > 0) return reply(route, gw.approvalReplies, {})
    return route.fulfill({ json: switched() })
  })
  await page.route(`${BASE}/verify`, async (route) => {
    gw.verifies += 1
    if (gw.verifyReplies.length > 0) return reply(route, gw.verifyReplies, {})
    return route.fulfill({ json: switched() })
  })
  // A browser wallet holding WALLET on Arbitrum One; records what it signs.
  await page.addInitScript((wallet) => {
    const signed: unknown[] = []
    Object.assign(window, { __signedTypedData: signed })
    Object.assign(window, {
      ethereum: {
        async request(args: { method: string; params?: unknown[] }) {
          if (args.method === 'eth_requestAccounts' || args.method === 'eth_accounts') {
            return [wallet]
          }
          if (args.method === 'eth_chainId') return '0xa4b1'
          if (args.method === 'eth_signTypedData_v4') {
            signed.push(JSON.parse(String(args.params?.[1])))
            return `0x${'ab'.repeat(64)}1b`
          }
          return null
        },
      },
    })
  }, WALLET)
  await page.goto(`/settings/accounts/${ACCOUNT_ID}/authorization${options.query ?? ''}`)
  const panel = page.getByTestId('agent-renewal')
  await expect(panel).toBeVisible()
  return { gw, panel, pageErrors }
}

test('renew, sign the replacement under its exact name, and switch', async ({ page }) => {
  const { gw, panel, pageErrors } = await openAuthorization(page)
  await expect(panel).toHaveClass(/agent-renewal--due/)
  await expect(panel).toContainText('The active agent expires in 2 days')
  await page.screenshot({ path: 'test-results/agent-renewal-idle.png', fullPage: true })

  await panel.getByRole('button', { name: 'Renew agent' }).click()
  await expect(panel).toContainText(`Replacement agent trad-2 (${REPLACEMENT}) waits for`)
  expect(gw.starts).toEqual([{}])
  await page.screenshot({ path: 'test-results/agent-renewal-awaiting.png', fullPage: true })

  const fetchesBefore = gw.accountFetches
  await panel.getByRole('button', { name: 'Approve in wallet' }).click()
  await expect(panel.getByRole('status')).toContainText(
    `Agent renewed. Trad now signs with trad-2 (${REPLACEMENT}), valid until`,
  )
  const approval = gw.approvals[0] as {
    action: Json
    agent_address: string
    agent_name: string
    nonce: number
    signature: Json
  }
  expect(approval.agent_address).toBe(REPLACEMENT)
  expect(approval.agent_name).toBe('trad-2')
  expect(approval.action).toMatchObject({
    type: 'approveAgent',
    hyperliquidChain: 'Mainnet',
    signatureChainId: '0xa4b1',
    agentAddress: REPLACEMENT,
    agentName: 'trad-2',
  })
  expect(approval.action.nonce).toBe(approval.nonce)
  const typed = (await page.evaluate(
    () => (window as unknown as { __signedTypedData: Array<{ message: Json }> }).__signedTypedData,
  )) as Array<{ message: Json }>
  expect(typed[0]?.message.agentName).toBe('trad-2')
  expect(gw.accountFetches).toBeGreaterThan(fetchesBefore)
  await expect(panel.getByRole('button', { name: 'Renew agent' })).toBeVisible()
  await expect(panel).not.toHaveClass(/agent-renewal--due/)
  await page.screenshot({ path: 'test-results/agent-renewal-switched.png', fullPage: true })
  expect(pageErrors).toEqual([])
})

for (const code of ['named_slots_full', 'renewal_slot_occupied']) {
  test(`${code}: the user picks another named slot`, async ({ page }) => {
    const { gw, panel, pageErrors } = await openAuthorization(page)
    gw.startReplies.push(refusal(code, 'All three named Hyperliquid agent slots are in use.'))
    await panel.getByRole('button', { name: 'Renew agent' }).click()
    const problem = panel.getByRole('alert')
    await expect(problem).toContainText('replaces the agent there')
    await expect(problem.getByRole('button', { name: 'Use slot trad' })).toHaveCount(0)
    await expect(problem.getByRole('button', { name: 'Use slot phone' })).toBeVisible()
    await page.screenshot({ path: `test-results/agent-renewal-${code}.png`, fullPage: true })
    await problem.getByRole('button', { name: 'Use slot bot' }).click()
    await expect(panel).toContainText(`Replacement agent bot (${REPLACEMENT}) waits for`)
    expect(gw.starts).toEqual([{}, { agent_name: 'bot' }])
    expect(pageErrors).toEqual([])
  })
}

test('not listed yet: check again verifies and switches', async ({ page }) => {
  const { gw, panel } = await openAuthorization(page)
  gw.approvalReplies.push(refusal('renewal_awaiting_approval'))
  await panel.getByRole('button', { name: 'Renew agent' }).click()
  await panel.getByRole('button', { name: 'Approve in wallet' }).click()
  await expect(panel.getByRole('alert')).toContainText(
    'Hyperliquid does not list the replacement agent yet',
  )
  await expect(panel.getByRole('alert')).toContainText('active agent keeps signing')
  await panel.getByRole('button', { name: 'Check again' }).click()
  await expect(panel.getByRole('status')).toContainText('Agent renewed.')
  expect(gw.verifies).toBe(1)
})

for (const [code, words] of [
  ['renewal_name_mismatch', 'under a different name'],
  ['renewal_expired', 'already expired'],
] as const) {
  test(`${code} explains that the active agent keeps working`, async ({ page }) => {
    const pending = {
      agent_name: 'trad-2',
      agent_address: REPLACEMENT,
      started_at: '2026-10-23T13:00:00Z',
    }
    const { gw, panel } = await openAuthorization(page, { pending })
    gw.verifyReplies.push(refusal(code))
    await panel.getByRole('button', { name: 'Check again' }).click()
    const problem = panel.getByRole('alert')
    await expect(problem).toContainText(words)
    await expect(problem).toContainText('The active agent keeps signing for this account')
    await expect(problem).toContainText('Cancel this renewal and start again')
    await expect(panel.getByRole('button', { name: 'Cancel renewal' })).toBeVisible()
  })
}

test('a pending renewal resumes on load and can be cancelled', async ({ page }) => {
  const pending = { agent_name: 'trad-2', agent_address: REPLACEMENT, started_at: 'x' }
  const { gw, panel, pageErrors } = await openAuthorization(page, {
    pending,
    validForMs: 30 * DAY,
  })
  await expect(panel).not.toHaveClass(/agent-renewal--due/)
  await expect(panel).toContainText(`Replacement agent trad-2 (${REPLACEMENT}) waits for`)
  await panel.getByRole('button', { name: 'Cancel renewal' }).click()
  await expect(panel.getByRole('button', { name: 'Renew agent' })).toBeVisible()
  expect(gw.cancels).toBe(1)
  expect(gw.starts).toEqual([])
  expect(pageErrors).toEqual([])
})

test('the expiry banner link starts the renewal at once', async ({ page }) => {
  const { gw, panel } = await openAuthorization(page, { query: '?renew=1' })
  await expect(panel).toContainText(`Replacement agent trad-2 (${REPLACEMENT}) waits for`)
  expect(gw.starts).toEqual([{}])
  await expect(page).toHaveURL(/\/authorization$/)
})

test('the banner on the authorization page starts the renewal too', async ({ page }) => {
  const { gw, panel } = await openAuthorization(page)
  await page.getByTestId('agent-expiry').getByRole('link', { name: 'Renew agent' }).click()
  await expect(panel).toContainText(`Replacement agent trad-2 (${REPLACEMENT}) waits for`)
  expect(gw.starts).toEqual([{}])
})
