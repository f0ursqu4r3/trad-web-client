import { expect, test } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('applies and renders a concentrated engine projection load', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: false }),
    })
  })

  await page.goto('/e2e/engine-projection-load?count=500&revisions=64')
  await page.waitForFunction(
    () => (window as any).__tradEngineProjectionLoad?.getState().phase === 'done',
    undefined,
    { timeout: 100_000 },
  )

  const result = await page.evaluate(() => (window as any).__tradEngineProjectionLoad?.getState())
  const resultPath = process.env.TRAD_ENGINE_PROJECTION_LOAD_RESULT_PATH
  if (resultPath) writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`)
  expect(result).toMatchObject({
    phase: 'done',
    commands: 500,
    trailingEntries: 500,
    revisions: 64,
    strategyUpdates: 32_000,
    error: null,
  })
  expect(result.elapsedMs).toBeLessThan(10_000)
  expect(result.maxEventLoopLagMs).toBeLessThan(500)
  await expect(page.locator('[data-command-id]')).toHaveCount(500)
})
