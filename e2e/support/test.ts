import { expect, test as base, type Page } from '@playwright/test'

// The fixture every mocked spec uses: no /api request leaves the page. A
// catch-all, installed before anything a spec mocks, answers an unmocked
// /api request with 599 and records it, and the test fails at teardown
// listing them (without it the request would reach the Vite proxy's
// backend). A spec's own routes, registered later, take precedence over
// these defaults:
// - the requests every page makes in the background: telemetry off (204),
//   Trad's market catalog unavailable (503, so the app uses Hyperliquid's
//   meta) and no profile (404, the fixtures set the user themselves);
// - the history routes (slice S3): empty pages, on /api and on a cell
//   edge's /ws/<cell>/api.
//
// The gated real-Mainnet spec talks to a real terminal and does not use it.

export interface HermeticApi {
  // Unmocked requests, as "METHOD path?query".
  escaped: string[]
}

const EMPTY_EVIDENCE = {
  commands: [],
  orders: [],
  protections: [],
  execution_groups: [],
  chases: [],
  trailing_entries: [],
  close_workflows: [],
  flatten_workflows: [],
  entry_cancellations: [],
  protection_amendments: [],
  native_protection: null,
  relationships: [],
  next: null,
}

// Today's /api, and a cell edge's history pages (/ws/<cell>/api/...).
function isApi(url: URL): boolean {
  return /^(\/ws\/[^/]+)?\/api(\/|$)/.test(url.pathname)
}

export async function installHermeticApi(page: Page): Promise<HermeticApi> {
  const api: HermeticApi = { escaped: [] }
  const origin = (url: URL) => url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  await page.route(
    (url) => origin(url) && isApi(url),
    (route) => {
      const url = new URL(route.request().url())
      api.escaped.push(`${route.request().method()} ${url.pathname}${url.search}`)
      return route.fulfill({ status: 599, json: { error: 'unmocked in e2e', code: 'unmocked' } })
    },
  )
  const path = (pattern: RegExp) => (url: URL) => origin(url) && pattern.test(url.pathname)
  await page.route(path(/^\/api\/telemetry(\/|$)/), (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  await page.route(path(/^\/api\/markets\//), (route) =>
    route.fulfill({ status: 503, json: { error: 'no node returned the instrument catalog' } }),
  )
  await page.route(path(/^\/api\/me$/), (route) =>
    route.fulfill({ status: 404, json: { error: 'no profile in e2e' } }),
  )
  await page.route(path(/^(\/ws\/[^/]+)?\/api\/accounts\/[^/]+\/trades$/), (route) =>
    route.fulfill({ json: { trades: [], next: null } }),
  )
  await page.route(path(/^(\/ws\/[^/]+)?\/api\/accounts\/[^/]+\/trades\/[^/]+\/fills$/), (route) =>
    route.fulfill({
      json: { trade_id: tradeIdOf(route.request().url()), fills: [], next: null },
    }),
  )
  await page.route(
    path(/^(\/ws\/[^/]+)?\/api\/accounts\/[^/]+\/trades\/[^/]+\/evidence$/),
    (route) =>
      route.fulfill({ json: { trade_id: tradeIdOf(route.request().url()), ...EMPTY_EVIDENCE } }),
  )
  await page.route(
    path(/^(\/ws\/[^/]+)?\/api\/accounts\/[^/]+\/positions\/[^/]+\/exposures$/),
    (route) => {
      const symbol = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2)!)
      return route.fulfill({ json: { symbol, total: 0, exposures: [], next: null } })
    },
  )
  return api
}

function tradeIdOf(url: string): string {
  return new URL(url).pathname.split('/').at(-2)!
}

export const test = base.extend<{ hermeticApi: HermeticApi }>({
  hermeticApi: [
    async ({ page }, use) => {
      const api = await installHermeticApi(page)
      await use(api)
      expect(api.escaped, 'unmocked /api requests escaped the page').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
