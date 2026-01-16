const PERF_FLAG_KEY = 'fe_perf_log'
const PERF_LOG_KEY = 'trad-fe-perf-log'
const DEFAULT_LOG_LIMIT = 10000
const DEFAULT_FLUSH_EVERY = 100

type PerfEntry = Record<string, unknown> & {
  ts: string
  scope: string
  duration_ms: number
}

const perfBuffer: PerfEntry[] = []
let flushCounter = 0

function getLogLimit(): number {
  try {
    const raw = localStorage.getItem('fe_perf_log_limit')
    const parsed = raw ? Number.parseInt(raw, 10) : NaN
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  } catch {
    // ignore
  }
  return DEFAULT_LOG_LIMIT
}

function getFlushEvery(): number {
  try {
    const raw = localStorage.getItem('fe_perf_log_flush')
    const parsed = raw ? Number.parseInt(raw, 10) : NaN
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  } catch {
    // ignore
  }
  return DEFAULT_FLUSH_EVERY
}

export function getPerfThreshold(defaultMs = 4): number {
  try {
    const raw = localStorage.getItem('fe_perf_log_threshold_ms')
    const parsed = raw ? Number.parseInt(raw, 10) : NaN
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  } catch {
    // ignore
  }
  return defaultMs
}

export function isPerfLogEnabled(): boolean {
  try {
    return localStorage.getItem(PERF_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function recordPerf(scope: string, startMs: number, extra?: Record<string, unknown>) {
  if (!isPerfLogEnabled()) return
  const durationMs = performance.now() - startMs
  recordPerfDuration(scope, durationMs, extra)
}

export function recordPerfDuration(
  scope: string,
  durationMs: number,
  extra?: Record<string, unknown>,
) {
  if (!isPerfLogEnabled()) return
  perfBuffer.push({
    ts: new Date().toISOString(),
    scope,
    duration_ms: Math.round(durationMs),
    ...extra,
  })
  const limit = getLogLimit()
  if (perfBuffer.length > limit) {
    perfBuffer.splice(0, perfBuffer.length - limit)
  }
  flushCounter += 1
  if (flushCounter % getFlushEvery() === 0) {
    flushPerfLog()
  }
}

export function flushPerfLog() {
  if (!isPerfLogEnabled()) return
  try {
    localStorage.setItem(PERF_LOG_KEY, JSON.stringify(perfBuffer))
  } catch {
    // ignore storage errors
  }
}
