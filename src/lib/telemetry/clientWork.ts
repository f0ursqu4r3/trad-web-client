import type { TelemetryRecord } from './contract.ts'
import { wholeNonNegative } from './connectionTiming.ts'

// Main-thread cost of the gateway stream, as `client_work_measured`: messages
// and bytes received, time to parse and apply each message (p95 and max in
// whole milliseconds, rounded up so measurable work never reads as 0), and
// long tasks where the browser reports them (Chromium; WebKit and Firefox
// report 0). At most one event per window, and only while messages arrive.

export const CLIENT_WORK_WINDOW_MS = 60_000
// Apply times above this share one bucket; apply_ms_max keeps the exact value.
const HISTOGRAM_MAX_MS = 1_000

export class ClientWorkMeter {
  private readonly now: () => number
  private readonly record: (record: TelemetryRecord) => void
  private readonly windowMs: number
  private windowStartedAt: number | null = null
  private messages = 0
  private bytes = 0
  private applyMaxMs = 0
  // histogram[n]: messages whose apply time rounded up to n milliseconds.
  private readonly histogram = new Uint32Array(HISTOGRAM_MAX_MS + 1)
  private longTasks = 0
  private longestTaskMs = 0

  constructor(
    now: () => number,
    record: (record: TelemetryRecord) => void,
    windowMs = CLIENT_WORK_WINDOW_MS,
  ) {
    this.now = now
    this.record = record
    this.windowMs = windowMs
  }

  message(bytes: number, applyMs: number): void {
    const now = this.now()
    if (this.windowStartedAt === null) this.windowStartedAt = now
    this.messages += 1
    this.bytes += wholeNonNegative(bytes)
    const rounded = Number.isFinite(applyMs) && applyMs > 0 ? Math.ceil(applyMs) : 0
    this.histogram[Math.min(rounded, HISTOGRAM_MAX_MS)]! += 1
    if (rounded > this.applyMaxMs) this.applyMaxMs = rounded
    if (now - this.windowStartedAt >= this.windowMs) this.emit(now)
  }

  longTask(durationMs: number): void {
    this.longTasks += 1
    const rounded = wholeNonNegative(durationMs)
    if (rounded > this.longestTaskMs) this.longestTaskMs = rounded
  }

  private emit(now: number): void {
    this.record({
      eventName: 'client_work_measured',
      properties: {
        messages: this.messages,
        bytes: this.bytes,
        apply_ms_p95: this.percentile(0.95),
        apply_ms_max: this.applyMaxMs,
        long_tasks: this.longTasks,
        longest_task_ms: this.longestTaskMs,
        window_ms: wholeNonNegative(now - (this.windowStartedAt ?? now)),
      },
    })
    this.windowStartedAt = now
    this.messages = 0
    this.bytes = 0
    this.applyMaxMs = 0
    this.histogram.fill(0)
    this.longTasks = 0
    this.longestTaskMs = 0
  }

  private percentile(fraction: number): number {
    const rank = Math.ceil(this.messages * fraction)
    let seen = 0
    for (let ms = 0; ms < this.histogram.length; ms += 1) {
      seen += this.histogram[ms]!
      if (seen >= rank) return ms
    }
    return this.applyMaxMs
  }
}

// Feeds long tasks to the meter where the browser reports them.
export function observeLongTasks(meter: ClientWorkMeter): void {
  try {
    if (typeof PerformanceObserver === 'undefined') return
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) meter.longTask(entry.duration)
    }).observe({ type: 'longtask' })
  } catch {
    // Measurement is optional; the page works without it.
  }
}
