import { expect, test } from '@playwright/test'
import { openWorkspace, type Json } from './support/workspaceWire'

interface TelemetryEvent {
  event_name: string
  account_id?: string
  properties: Record<string, unknown>
}

test('browser reports a quiet connected market as ready with its sample age', async ({ page }) => {
  const events: TelemetryEvent[] = []
  await page.route('**/api/telemetry/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: 1,
        collection_enabled: true,
        max_batch_bytes: 65_536,
        max_events_per_batch: 64,
        flush_interval_ms: 1_000,
        queue_capacity: 64,
        max_event_age_ms: 60_000,
      }),
    })
  })
  await page.route('**/api/telemetry/events', async (route) => {
    const batch = route.request().postDataJSON() as { events?: TelemetryEvent[] }
    events.push(...(batch.events ?? []))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        collection_enabled: true,
        accepted: batch.events?.length ?? 0,
        duplicate: 0,
        invalid: 0,
        dropped: 0,
        sequence_gaps: 0,
      }),
    })
  })
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })
  await page.route('https://api.hyperliquid.xyz/info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ universe: [{ name: 'ETH', szDecimals: 4 }] }),
    })
  })

  await page.goto('/e2e/trader-workspace?stale_market=1')
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await expect(eth.locator('.metric-pnl')).toContainText('Last trade')
  await expect(eth.locator('.metric-pnl')).toContainText('Gross open')
  await expect
    .poll(() =>
      events.find(
        (event) =>
          event.event_name === 'market_stream_state_changed' && event.properties.state === 'ready',
      ),
    )
    .toBeTruthy()

  const event = events.find(
    (candidate) =>
      candidate.event_name === 'market_stream_state_changed' &&
      candidate.properties.state === 'ready',
  )!
  expect(event.account_id).toBeTruthy()
  expect(['BTC', 'ETH', 'SOL']).toContain(event.properties.market_symbol)
  expect(event.properties.source).toBe('card')
  expect(event.properties.market_sample_age_bucket).toBe('stale_under_60s')
  expect(event.properties).not.toHaveProperty('price')
  expect(event.properties).not.toHaveProperty('pnl')
  expect(event.properties).not.toHaveProperty('wallet')
  expect(event.properties).not.toHaveProperty('raw_error')
})

test('authenticated browser telemetry reaches the real Gateway collector', async ({ page }) => {
  test.skip(
    process.env.TRAD_GATEWAY_TELEMETRY_E2E !== '1',
    'requires a local test-auth Gateway and disposable PostgreSQL databases',
  )

  await page.route('https://api.hyperliquid.xyz/info', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ universe: [{ name: 'ETH', szDecimals: 4 }] }),
    })
  })
  const telemetryConfigured = page.waitForResponse(
    (response) => response.url().endsWith('/api/telemetry/config') && response.status() === 200,
  )
  const returnTo = encodeURIComponent('/e2e/trader-workspace')
  await page.goto(`/auth/test-login?email=telemetry-e2e%40trad.local&return_to=${returnTo}`)
  await telemetryConfigured
  const accountId = await page.evaluate(async () => {
    const label = 'telemetry-fixture'
    const created = await fetch(`/api/accounts/${label}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        key: 'fixture-key',
        secret: 'fixture-secret',
        network: 'mainnet',
        exchange: 'bifake',
      }),
    })
    if (!created.ok) throw new Error(`fixture account creation failed: ${created.status}`)
    const accounts = (await fetch('/api/accounts', { credentials: 'include' }).then((response) =>
      response.json(),
    )) as Array<{ id: string; label: string }>
    const account = accounts.find((candidate) => candidate.label === label)
    if (!account) throw new Error('fixture account was not returned')
    return account.id
  })

  const acceptedMarketBatch = page.waitForResponse((response) => {
    if (!response.url().endsWith('/api/telemetry/events') || response.status() !== 202) return false
    const batch = response.request().postDataJSON() as { events?: TelemetryEvent[] }
    return Boolean(
      batch.events?.some(
        (event) =>
          event.event_name === 'market_stream_state_changed' && event.properties.state === 'ready',
      ),
    )
  })

  await page.goto(
    `/e2e/trader-workspace?stale_market=1&account_id=${encodeURIComponent(accountId)}`,
  )
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' })
  await expect(eth.locator('.metric-pnl')).toContainText('Last trade')

  const response = await acceptedMarketBatch
  const result = (await response.json()) as {
    accepted?: number
    invalid?: number
    dropped?: number
  }
  expect(result.accepted).toBeGreaterThan(0)
  expect(result.invalid).toBe(0)
  expect(result.dropped).toBe(0)
})

function cardMarketEvents(events: Json[]): Json[] {
  return events.filter(
    (event) =>
      event.event_name === 'market_stream_state_changed' && event.properties?.source === 'card',
  )
}

test('a dropped gateway socket shows cards reconnecting, never a bare error', async ({ page }) => {
  const wire = await openWorkspace(page, { telemetry: true })
  const cards = page.getByTestId('managed-trade-card')
  await expect(cards).toHaveCount(3)
  const eth = cards.filter({ hasText: 'ETH' }).first()
  await expect(eth.locator('.metric-pnl')).toContainText('Gross open')
  await expect
    .poll(() => cardMarketEvents(wire.telemetry).filter((e) => e.properties.state === 'ready'))
    .toHaveLength(3)
  const before = wire.telemetry.length

  await wire.dropSocket()
  await expect
    .poll(() =>
      cardMarketEvents(wire.telemetry.slice(before)).filter(
        (event) => event.properties.state === 'reconnecting',
      ),
    )
    .toHaveLength(3)
  await expect(eth.locator('.metric-pnl')).toContainText('Gross open')
  await expect
    .poll(() =>
      cardMarketEvents(wire.telemetry.slice(before)).filter(
        (event) => event.properties.state === 'ready',
      ),
    )
    .toHaveLength(3)

  const after = cardMarketEvents(wire.telemetry.slice(before))
  for (const event of after.filter((candidate) => candidate.properties.state === 'reconnecting')) {
    expect(event.properties.outcome_code).toBe('transport_interrupted')
  }
  expect(after.filter((event) => event.properties.state === 'error')).toEqual([])
})

test('a card market error carries the gateway reason', async ({ page }) => {
  const wire = await openWorkspace(page, {
    telemetry: true,
    marketError: (symbol) => (symbol === 'ETH' ? { kind: 'unauthorized' } : null),
  })
  const eth = page.getByTestId('managed-trade-card').filter({ hasText: 'ETH' }).first()
  await expect(eth.locator('.metric-pnl')).toContainText('feed unavailable')
  await expect
    .poll(() =>
      cardMarketEvents(wire.telemetry).find(
        (event) => event.properties.state === 'error' && event.properties.market_symbol === 'ETH',
      ),
    )
    .toBeTruthy()
  const errors = cardMarketEvents(wire.telemetry).filter(
    (event) => event.properties.state === 'error',
  )
  for (const event of errors) expect(event.properties.reason_code).toBe('unauthorized')
})
