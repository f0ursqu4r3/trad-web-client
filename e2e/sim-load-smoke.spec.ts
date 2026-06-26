import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('FE websocket handles simulated TE load', async ({ page }) => {
  test.setTimeout(180_000)

  const token = process.env.TRAD_E2E_SIM_TOKEN || 'sim-load-smoke-token'
  const count = process.env.TRAD_E2E_SIM_LOAD_COUNT || '25'
  const inspect = process.env.TRAD_E2E_SIM_LOAD_INSPECT || count
  const durationMs = process.env.TRAD_E2E_SIM_LOAD_DURATION_MS || '15000'
  const tickMs = process.env.TRAD_E2E_SIM_LOAD_TICK_MS || '100'

  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  const params = new URLSearchParams({
    autostart: '1',
    token,
    count,
    inspect,
    durationMs,
    tickMs,
  })
  await page.goto(`/e2e/sim-load-smoke?${params.toString()}`)

  await page.waitForFunction(
    () => (window as any).__tradSimLoadSmoke?.getState().phase === 'done',
    undefined,
    { timeout: 160_000 },
  )

  const result = await page.evaluate(() => (window as any).__tradSimLoadSmoke?.getState())
  if (process.env.TRAD_E2E_SIM_LOAD_RESULT_PATH) {
    writeFileSync(
      process.env.TRAD_E2E_SIM_LOAD_RESULT_PATH,
      `${JSON.stringify(result, null, 2)}\n`,
    )
  }

  const expectedInspected = Math.min(Number(count), Number(inspect))
  expect(result).toBeTruthy()
  expect(result?.phase).toBe('done')
  expect(result?.error).toBeNull()
  expect(result?.submitted).toBe(Number(count))
  expect(result?.teDeviceCount).toBeGreaterThanOrEqual(expectedInspected)
  expect(result?.totalTePoints).toBeGreaterThan(0)
})
