import type { CDPSession, Page } from '@playwright/test'
import { expect, test } from './support/test'
import { appendFileSync, writeFileSync } from 'node:fs'
import { installVisibilitySwitch, openWorkspace, setTabHidden } from './support/workspaceWire'

// Measures the trader workspace under a realistic stream: six trade cards,
// BTC, ETH and ZEC trades at a high rate, and engine projection deltas, then
// a background-tab round trip. Run on demand:
//   TRAD_WORKSPACE_PERF=1 npx playwright test workspace-performance --workers=1
// TRAD_WORKSPACE_PERF_RESULT=<path> also appends the numbers as a JSON line;
// TRAD_WORKSPACE_CPU_THROTTLE=<n> emulates an n times slower CPU.

const MARKET_INTERVAL_MS = 50 // 20 messages a second per market
const DELTA_INTERVAL_MS = 250
const MEASURE_MS = 10_000
const HIDDEN_MS = 10_000
const RETURN_MS = 1_500

test.skip(!process.env.TRAD_WORKSPACE_PERF, 'set TRAD_WORKSPACE_PERF=1 to measure')

// TaskDuration is wall time spent in main-thread tasks; ThreadTime is the
// main thread's CPU time, which holds up better on a loaded machine.
async function mainThread(
  cdp: CDPSession,
): Promise<{ task: number; cpu: number; layouts: number; styles: number }> {
  const { metrics } = await cdp.send('Performance.getMetrics')
  const value = (name: string) => metrics.find((metric) => metric.name === name)?.value ?? 0
  return {
    task: value('TaskDuration'),
    cpu: value('ThreadTime'),
    layouts: value('LayoutCount'),
    styles: value('RecalcStyleCount'),
  }
}

interface Probe {
  longTasks: Array<{ start: number; duration: number }>
  frames: number[]
  lastFrame: number
}

async function installProbes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = {
      longTasks: [] as Array<{ start: number; duration: number }>,
      frames: [] as number[],
      lastFrame: 0,
    }
    ;(window as unknown as { __perfProbe: typeof probe }).__perfProbe = probe
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longTasks.push({ start: entry.startTime, duration: entry.duration })
      }
    }).observe({ type: 'longtask', buffered: true })
    const frame = (time: number) => {
      if (probe.lastFrame !== 0) probe.frames.push(time - probe.lastFrame)
      probe.lastFrame = time
      window.requestAnimationFrame(frame)
    }
    window.requestAnimationFrame(frame)
  })
}

interface Window {
  longTasks: number
  longTaskMs: number
  maxLongTaskMs: number
  p95FrameMs: number
  framesOver50Ms: number
  mainThreadBusy: number
  cpuMsPerSecond: number
  layoutsPerSecond: number
  styleRecalcsPerSecond: number
}

async function measure(page: Page, cdp: CDPSession, durationMs: number): Promise<Window> {
  const started = await page.evaluate(() => {
    const probe = (window as unknown as { __perfProbe: Probe }).__perfProbe
    probe.frames = []
    probe.lastFrame = 0
    return performance.now()
  })
  const before = await mainThread(cdp)
  await page.waitForTimeout(durationMs)
  const after = await mainThread(cdp)
  const sample = await page.evaluate((since) => {
    const probe = (window as unknown as { __perfProbe: Probe }).__perfProbe
    return {
      longTasks: probe.longTasks.filter((task) => task.start >= since),
      frames: [...probe.frames],
      elapsed: performance.now() - since,
    }
  }, started)
  const frames = sample.frames.sort((a: number, b: number) => a - b)
  const longTaskMs = sample.longTasks.reduce((sum, task) => sum + task.duration, 0)
  return {
    longTasks: sample.longTasks.length,
    longTaskMs: Math.round(longTaskMs),
    maxLongTaskMs: Math.round(Math.max(0, ...sample.longTasks.map((task) => task.duration))),
    p95FrameMs: Math.round((frames[Math.floor(frames.length * 0.95)] ?? 0) * 10) / 10,
    framesOver50Ms: frames.filter((frame: number) => frame > 50).length,
    mainThreadBusy:
      Math.round(((after.task - before.task) * 1_000 * 1_000) / sample.elapsed) / 1_000,
    cpuMsPerSecond: Math.round(((after.cpu - before.cpu) * 1_000 * 1_000) / sample.elapsed),
    layoutsPerSecond: Math.round(((after.layouts - before.layouts) * 1_000) / sample.elapsed),
    styleRecalcsPerSecond: Math.round(((after.styles - before.styles) * 1_000) / sample.elapsed),
  }
}

test('trader workspace under a busy market stream and a background-tab round trip', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await installVisibilitySwitch(page)
  await installProbes(page)
  const wire = await openWorkspace(page, { busy: true })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  // TRAD_WORKSPACE_CPU_THROTTLE=4 runs the page as on a four times slower CPU.
  const throttle = Number(process.env.TRAD_WORKSPACE_CPU_THROTTLE ?? 1)
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })

  const cards = page.getByTestId('managed-trade-card')
  await expect(cards).toHaveCount(6, { timeout: 15_000 })
  await expect
    .poll(() => ['BTC', 'ETH', 'ZEC'].every((symbol) => wire.markets.has(symbol)))
    .toBe(true)

  const stream = setInterval(() => {
    for (const symbol of ['BTC', 'ETH', 'ZEC']) wire.sendSamples(symbol, 1 + (Date.now() % 3))
  }, MARKET_INTERVAL_MS)
  const deltas = setInterval(() => wire.sendDelta(), DELTA_INTERVAL_MS)
  try {
    await page.waitForTimeout(2_000)
    const profilePath = process.env.TRAD_WORKSPACE_PROFILE
    if (profilePath) {
      await cdp.send('Profiler.enable')
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
      await cdp.send('Profiler.start')
    }
    const visible = await measure(page, cdp, MEASURE_MS)
    if (profilePath) {
      const { profile } = await cdp.send('Profiler.stop')
      writeFileSync(profilePath, JSON.stringify(profile))
    }

    const subscribesBefore = wire.subscribes.length
    const unsubscribesBefore = wire.unsubscribes.length
    const accountSubscribesBefore = wire.accountSubscribes
    const fetchesBefore = wire.accountFetches
    await setTabHidden(page, true)
    const hiddenBefore = await mainThread(cdp)
    await page.waitForTimeout(HIDDEN_MS)
    const hiddenAfter = await mainThread(cdp)

    await setTabHidden(page, false)
    const back = await measure(page, cdp, RETURN_MS)
    await setTabHidden(page, true)
    await setTabHidden(page, false)
    await page.waitForTimeout(500)

    const result = {
      visible,
      hidden: {
        mainThreadBusy:
          Math.round((((hiddenAfter.task - hiddenBefore.task) * 1_000) / HIDDEN_MS) * 1_000) /
          1_000,
        cpuMsPerSecond: Math.round(
          ((hiddenAfter.cpu - hiddenBefore.cpu) * 1_000 * 1_000) / HIDDEN_MS,
        ),
      },
      returning: back,
      roundTrip: {
        marketSubscribes: wire.subscribes.length - subscribesBefore,
        marketUnsubscribes: wire.unsubscribes.length - unsubscribesBefore,
        accountResubscribes: wire.accountSubscribes - accountSubscribesBefore,
        accountFetches: wire.accountFetches - fetchesBefore,
      },
    }
    console.log(JSON.stringify(result, null, 2))
    const resultPath = process.env.TRAD_WORKSPACE_PERF_RESULT
    if (resultPath) appendFileSync(resultPath, `${JSON.stringify(result)}\n`)
    expect(result.roundTrip.marketSubscribes).toBe(0)
    expect(result.roundTrip.accountResubscribes).toBe(0)
  } finally {
    clearInterval(stream)
    clearInterval(deltas)
  }
  await expect(cards).toHaveCount(6)
})
