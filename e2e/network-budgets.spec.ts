import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from './support/test'
import { appendFileSync } from 'node:fs'
import { heavyAccountSnapshot, syntheticFill } from './support/heavyAccount'
import { openWorkspace, type Json, type WorkspaceWire } from './support/workspaceWire'

// Network and main-thread budgets for the trader workspace on a heavy
// synthetic account (networking work item 4, frontend part). The budgets
// themselves live in the backend repo's docs/networking-2026-10.md; this
// spec measures against them and ratchets: it fails only when a number gets
// worse than NETWORK_BUDGET_RATCHET below, and the table only ever tightens.
//
// Profiles (playwright.config.ts):
// - chromium: desktop Chrome, unthrottled.
// - phone-chromium-4x: Chromium with a phone viewport, touch and 4x CPU
//   throttling through CDP. This is the phone *compute* measurement:
//   Playwright cannot throttle WebKit's CPU.
// - phone-webkit: WebKit on an iPhone profile, unthrottled. Correctness on
//   Safari's engine; its timings are desktop-CPU timings, at 1 ms
//   resolution, and WebKit reports no long tasks.
// Frames travel over a real WebSocket on 127.0.0.1 (support/loopbackSocket.ts):
// no network latency, loss or bandwidth here (that is the toxiproxy roaming
// profile).
//
// Each run loads the page twice: cold (first visit, nothing remembered) and
// warm (reload; the card coins are remembered), with the account snapshot
// held for SNAPSHOT_IN_FLIGHT_MS on the warm load to stand in for a slow
// transfer. `pricesBeforeSnapshot` records whether every visible card's
// price arrived while that snapshot was in flight; it is recorded, not yet
// required. Then STEADY_MS of steady state: three coins at 20 messages a
// second and an account delta every 250 ms, every fourth with a new fill.
//
//   npx playwright test network-budgets --workers=1
//   TRAD_NETWORK_BUDGET_RESULT=<path> appends each result as a JSON line.

const HEAVY_TERMINAL_COMMANDS = 2_000
const HEAVY_EXECUTIONS = 20_000
const SNAPSHOT_IN_FLIGHT_MS = 1_500
const STEADY_MS = 5_000
const CARD_SYMBOLS = ['BTC', 'ETH', 'SOL']
// Timings vary run to run on a shared machine; bytes do not.
const TIMING_SLACK = 2
const TIMING_FLOOR_MS = 50
const BYTES_SLACK = 1.01

interface Ratchet {
  snapshotBytes: number
  coldReceivedBytes: number
  coldSnapshotAppliedMs: number
  coldAllCardsPricedMs: number
  coldCardsRenderedMs: number
  applyP95Ms: number
  applyMaxMs: number
  longTasks: number | null
  longestTaskMs: number | null
  steadyApplyP95Ms: number
  steadyLongestTaskMs: number | null
}

// NETWORK_BUDGET_RATCHET: worst of three runs per profile on the shared dev
// box, over the loopback socket (frontend release/v0.10.32-frontend,
// Playwright 1.61.1). First recorded 2026-10-23; tightened the same day
// after the projection reactivity work, keeping an entry where a run did
// not beat it (the snapshot parse+apply time, a long-task count). Bytes
// rose by 4 when the heavy account's live window was fixed to hold all of
// its terminal commands. Targets are in docs/networking-2026-10.md
// "Budgets" (backend repo); several of these still miss them. Tighten an
// entry when a change improves it; never loosen one. WebKit reports no long
// tasks (null).
const NETWORK_BUDGET_RATCHET: Record<string, Ratchet | null> = {
  chromium: {
    snapshotBytes: 15_652_212,
    coldReceivedBytes: 15_653_880,
    coldSnapshotAppliedMs: 95,
    coldAllCardsPricedMs: 360,
    coldCardsRenderedMs: 1_240,
    applyP95Ms: 26,
    applyMaxMs: 26,
    longTasks: 1,
    longestTaskMs: 230,
    steadyApplyP95Ms: 0.2,
    steadyLongestTaskMs: 0,
  },
  'phone-chromium-4x': {
    snapshotBytes: 15_652_212,
    coldReceivedBytes: 15_653_880,
    coldSnapshotAppliedMs: 250,
    coldAllCardsPricedMs: 1_290,
    coldCardsRenderedMs: 1_920,
    applyP95Ms: 97,
    applyMaxMs: 97,
    longTasks: 3,
    longestTaskMs: 330,
    steadyApplyP95Ms: 0.7,
    // 0 when run alone; 57 with three profiles running at once.
    steadyLongestTaskMs: 57,
  },
  'phone-webkit': {
    snapshotBytes: 15_652_212,
    coldReceivedBytes: 15_653_880,
    coldSnapshotAppliedMs: 150,
    coldAllCardsPricedMs: 360,
    coldCardsRenderedMs: 1_250,
    applyP95Ms: 36,
    applyMaxMs: 36,
    longTasks: null,
    longestTaskMs: null,
    steadyApplyP95Ms: 1,
    steadyLongestTaskMs: null,
  },
}

interface Probe {
  // Filled by the gateway store: parse plus handling time of each frame.
  frames: Array<{ kind: string; bytes: number; ms: number }>
  longTasks: Array<{ start: number; duration: number }> | null
}

// The socket here is Playwright's in-page mock, so frames are timed by the
// gateway store itself (the same numbers client_work_measured reports), and
// long tasks come from PerformanceObserver where the browser has them.
async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: Probe['frames'] = []
    const probe: Probe = { frames, longTasks: null }
    ;(window as unknown as { __netProbe: Probe }).__netProbe = probe
    ;(window as unknown as { __tradFrameProbe: Probe['frames'] }).__tradFrameProbe = frames
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        probe.longTasks = []
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            probe.longTasks!.push({ start: entry.startTime, duration: entry.duration })
          }
        }).observe({ type: 'longtask', buffered: true })
      }
    } catch {
      probe.longTasks = null
    }
  })
}

// Work since `since` (a frame count and a page time), or since page start.
async function readProbe(page: Page, since = { frames: 0, at: 0 }) {
  const all = await page.evaluate(() => (window as unknown as { __netProbe: Probe }).__netProbe)
  const probe = {
    frames: all.frames.slice(since.frames),
    longTasks: all.longTasks?.filter((task) => task.start >= since.at) ?? null,
  }
  const times = probe.frames.map((frame) => frame.ms).sort((a, b) => a - b)
  const percentile = (fraction: number) =>
    times.length === 0
      ? 0
      : times[Math.min(times.length - 1, Math.ceil(times.length * fraction) - 1)]!
  const longTasks = probe.longTasks
  const snapshot = probe.frames.find((frame) => frame.kind === 'account_snapshot')
  return {
    messages: probe.frames.length,
    frameBytes: probe.frames.reduce((sum, frame) => sum + frame.bytes, 0),
    snapshotApplyMs: snapshot === undefined ? null : round(snapshot.ms),
    applyP95Ms: round(percentile(0.95)),
    applyMaxMs: round(times[times.length - 1] ?? 0),
    longTasks: longTasks === null ? null : longTasks.length,
    longestTaskMs:
      longTasks === null ? null : round(Math.max(0, ...longTasks.map((task) => task.duration))),
  }
}

// Milliseconds since navigation start when every visible trade card is on
// screen. (Card prices are timed by the page's own first_price telemetry;
// not every card shows a priced number, e.g. a chase without fills.)
async function cardsRenderedAt(page: Page, timeout: number): Promise<number> {
  const handle = await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid="managed-trade-card"]').length >= count
        ? performance.now()
        : false,
    CARD_SYMBOLS.length,
    { timeout, polling: 50 },
  )
  return round((await handle.jsonValue()) as number)
}

function timingEvents(wire: WorkspaceWire, sessionId: string) {
  return wire.telemetry.filter(
    (event) => event.session_id === sessionId && event.event_name === 'connection_timing_measured',
  )
}

async function connectionTimings(wire: WorkspaceWire, excludeSessions: string[]) {
  let sessionId = ''
  await expect
    .poll(
      () => {
        const session = wire.telemetry.find(
          (event) =>
            event.event_name === 'connection_timing_measured' &&
            !excludeSessions.includes(event.session_id),
        )
        sessionId = session?.session_id ?? ''
        if (sessionId === '') return false
        const events = timingEvents(wire, sessionId)
        const stages = new Set(
          events.map(
            (event: Json) => `${event.properties.stage}:${event.properties.market_symbol ?? ''}`,
          ),
        )
        return (
          stages.has('snapshot_applied:') &&
          CARD_SYMBOLS.every((symbol) => stages.has(`first_price:${symbol}`))
        )
      },
      { timeout: 20_000 },
    )
    .toBe(true)
  const events = timingEvents(wire, sessionId)
  const stage = (name: string, symbol?: string) =>
    events.find(
      (event: Json) =>
        event.properties.stage === name &&
        (symbol === undefined || event.properties.market_symbol === symbol),
    )?.properties
  const firstPriceMs = Object.fromEntries(
    CARD_SYMBOLS.map((symbol) => [symbol, stage('first_price', symbol)!.elapsed_ms as number]),
  )
  const snapshotAppliedMs = stage('snapshot_applied')!.elapsed_ms as number
  return {
    sessionId,
    socketConnectedMs: stage('socket_connected')!.elapsed_ms as number,
    snapshotAppliedMs,
    snapshotPayloadBytes: stage('snapshot_applied')!.payload_bytes as number,
    firstPriceMs,
    allCardsPricedMs: Math.max(...Object.values(firstPriceMs)),
    pricesBeforeSnapshot: CARD_SYMBOLS.every((symbol) => firstPriceMs[symbol]! < snapshotAppliedMs),
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function totalBytes(wire: WorkspaceWire): number {
  return Object.values(wire.received).reduce((sum, kind) => sum + kind.bytes, 0)
}

function trafficSince(before: WorkspaceWire['received'], wire: WorkspaceWire) {
  return Object.fromEntries(
    Object.entries(wire.received).map(([kind, now]) => [
      kind,
      {
        messages: now.messages - (before[kind]?.messages ?? 0),
        bytes: now.bytes - (before[kind]?.bytes ?? 0),
      },
    ]),
  )
}

function checkRatchet(testInfo: TestInfo, measured: Ratchet): void {
  const ratchet = NETWORK_BUDGET_RATCHET[testInfo.project.name]
  if (ratchet === null || ratchet === undefined) return
  expect(measured.snapshotBytes, 'snapshot bytes').toBeLessThanOrEqual(
    Math.ceil(ratchet.snapshotBytes * BYTES_SLACK),
  )
  expect(measured.coldReceivedBytes, 'bytes received on a cold load').toBeLessThanOrEqual(
    Math.ceil(ratchet.coldReceivedBytes * BYTES_SLACK),
  )
  for (const key of [
    'coldSnapshotAppliedMs',
    'coldAllCardsPricedMs',
    'coldCardsRenderedMs',
    'applyP95Ms',
    'applyMaxMs',
    'steadyApplyP95Ms',
  ] as const) {
    expect(measured[key], key).toBeLessThanOrEqual(
      Math.max(ratchet[key] * TIMING_SLACK, ratchet[key] + TIMING_FLOOR_MS),
    )
  }
  for (const key of ['longestTaskMs', 'steadyLongestTaskMs'] as const) {
    const limit = ratchet[key]
    const value = measured[key]
    if (limit === null || value === null) continue
    expect(value, key).toBeLessThanOrEqual(Math.max(limit * TIMING_SLACK, limit + TIMING_FLOOR_MS))
  }
}

test('heavy account: bytes, time to snapshot and first prices, main-thread work', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  const throttle = Number(testInfo.project.metadata.cpuThrottle ?? 1)
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  await installProbe(page)
  const snapshot = heavyAccountSnapshot(HEAVY_TERMINAL_COMMANDS, HEAVY_EXECUTIONS)

  // Cold: first visit.
  const wire = await openWorkspace(page, { snapshot, telemetry: true, loopback: true })
  const coldCardsRenderedMs = await cardsRenderedAt(page, 120_000)
  const cold = await connectionTimings(wire, [])
  const coldWork = await readProbe(page)
  const coldTraffic = structuredClone(wire.received)
  const coldReceivedBytes = totalBytes(wire)

  // Warm: reload with the card coins remembered; the snapshot is in flight
  // for SNAPSHOT_IN_FLIGHT_MS.
  wire.holdSnapshots()
  await page.reload()
  await page.waitForTimeout(SNAPSHOT_IN_FLIGHT_MS)
  wire.releaseSnapshots()
  const warmCardsRenderedMs = await cardsRenderedAt(page, 120_000)
  const warm = await connectionTimings(wire, [cold.sessionId])
  const warmWork = await readProbe(page)

  // Steady state on the heavy account: three coins at 20 messages a second
  // each and an account delta every 250 ms, every fourth with a new fill.

  const steadySince = await page.evaluate(() => ({
    frames: (window as unknown as { __netProbe: Probe }).__netProbe.frames.length,
    at: performance.now(),
  }))
  const stream = setInterval(() => {
    for (const symbol of CARD_SYMBOLS) wire.sendSamples(symbol, 1)
  }, 50)
  // Every fourth delta also carries a new fill, as live trading does.
  let fills = HEAVY_EXECUTIONS
  let deltaCount = 0
  const deltas = setInterval(() => {
    deltaCount += 1
    wire.sendDelta(deltaCount % 4 === 0 ? { executions: [syntheticFill(fills++)] } : {})
  }, 250)
  try {
    await page.waitForTimeout(STEADY_MS)
  } finally {
    clearInterval(stream)
    clearInterval(deltas)
  }
  const steadyWork = await readProbe(page, steadySince)

  const result = {
    profile: testInfo.project.name,
    cpuThrottle: throttle,
    account: {
      terminalCommands: HEAVY_TERMINAL_COMMANDS,
      executions: snapshot.executions.length,
      visibleCards: CARD_SYMBOLS.length,
    },
    cold: {
      receivedBytes: coldReceivedBytes,
      receivedByKind: coldTraffic,
      snapshotBytes: coldTraffic.account_snapshot?.bytes ?? 0,
      socketConnectedMs: cold.socketConnectedMs,
      snapshotAppliedMs: cold.snapshotAppliedMs,
      firstPriceMs: cold.firstPriceMs,
      allCardsPricedMs: cold.allCardsPricedMs,
      cardsRenderedMs: coldCardsRenderedMs,
      pricesBeforeSnapshot: cold.pricesBeforeSnapshot,
      work: coldWork,
    },
    warm: {
      snapshotInFlightMs: SNAPSHOT_IN_FLIGHT_MS,
      receivedByKind: trafficSince(coldTraffic, wire),
      snapshotAppliedMs: warm.snapshotAppliedMs,
      firstPriceMs: warm.firstPriceMs,
      allCardsPricedMs: warm.allCardsPricedMs,
      cardsRenderedMs: warmCardsRenderedMs,
      pricesBeforeSnapshot: warm.pricesBeforeSnapshot,
      work: warmWork,
    },
    steady: { durationMs: STEADY_MS, work: steadyWork },
  }
  console.log(JSON.stringify(result, null, 2))
  await testInfo.attach('network-budget.json', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  })
  const resultPath = process.env.TRAD_NETWORK_BUDGET_RESULT
  if (resultPath) appendFileSync(resultPath, `${JSON.stringify(result)}\n`)

  // The telemetry's snapshot size is the frame the page received.
  expect(cold.snapshotPayloadBytes).toBe(result.cold.snapshotBytes)
  checkRatchet(testInfo, {
    snapshotBytes: result.cold.snapshotBytes,
    coldReceivedBytes,
    coldSnapshotAppliedMs: cold.snapshotAppliedMs,
    coldAllCardsPricedMs: cold.allCardsPricedMs,
    coldCardsRenderedMs,
    applyP95Ms: Math.max(coldWork.applyP95Ms, warmWork.applyP95Ms),
    applyMaxMs: Math.max(coldWork.applyMaxMs, warmWork.applyMaxMs),
    longTasks: coldWork.longTasks,
    longestTaskMs:
      coldWork.longestTaskMs === null
        ? null
        : Math.max(coldWork.longestTaskMs, warmWork.longestTaskMs ?? 0),
    steadyApplyP95Ms: steadyWork.applyP95Ms,
    steadyLongestTaskMs: steadyWork.longestTaskMs,
  })
})
