import type { Page } from '@playwright/test'

// A Gateway for the login and control-plane pages: the session is mocked,
// unmocked API calls answer 404, and the socket is accepted and stays silent.
// /auth/logout ends the mocked session.
export async function mockGateway(page: Page, options: { authenticated: boolean }) {
  let authenticated = options.authenticated
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, json: { error: 'not mocked' } }),
  )
  await page.route('**/api/telemetry**', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/api/accounts', (route) => route.fulfill({ json: [] }))
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      json: authenticated
        ? { authenticated: true, user: { sub: 'auth0|1', email: 'person@example.com' } }
        : { authenticated: false },
    }),
  )
  await page.route('**/auth/ws-ticket', (route) =>
    route.fulfill({ json: { token: 'fixture-ticket', expires_in: 60 } }),
  )
  await page.route('**/auth/logout', (route) => {
    authenticated = false
    return route.fulfill({ status: 204, body: '' })
  })
  await page.routeWebSocket('**/ws', () => {})
}
