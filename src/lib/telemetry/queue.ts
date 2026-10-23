import type { QueuedTelemetryEvent } from './contract.ts'

export type TelemetrySendFailure = 'transport' | 'rejected'

// How long queued events wait for the network. The gateway accepts late
// events (it flags them after five minutes), so a phone in a tunnel or on
// flight wifi keeps its observations; the queue capacity bounds memory.
export const TELEMETRY_STALL_RETENTION_MS = 30 * 60_000
const MAX_RETRY_DELAY_MS = 120_000

export function telemetryRetentionMs(configuredMaxAgeMs: number): number {
  return Math.max(configuredMaxAgeMs, TELEMETRY_STALL_RETENTION_MS)
}

// An HTTP status from the ingestion endpoint: network-shaped failures retry
// without spending an attempt; other refusals spend one.
export function telemetryStatusFailure(status: number): TelemetrySendFailure {
  if (status === 408 || status === 425 || status === 429 || status >= 500) return 'transport'
  return 'rejected'
}

// Next flush delay after `failures` consecutive failed sends.
export function telemetryRetryDelayMs(flushIntervalMs: number, failures: number): number {
  if (failures <= 0) return flushIntervalMs
  return Math.min(flushIntervalMs * 2 ** Math.min(failures - 1, 6), MAX_RETRY_DELAY_MS)
}

export function enqueueTelemetry(
  queue: QueuedTelemetryEvent[],
  item: QueuedTelemetryEvent,
  capacity: number,
): void {
  if (capacity <= 0) return
  queue.push(item)
  const excess = queue.length - capacity
  if (excess > 0) queue.splice(0, excess)
}

export function takeTelemetryBatch(
  queue: QueuedTelemetryEvent[],
  now: number,
  maxAgeMs: number,
  maxEvents: number,
  maxBytes: number,
): QueuedTelemetryEvent[] {
  discardExpired(queue, now, maxAgeMs)
  const selected: QueuedTelemetryEvent[] = []
  while (selected.length < maxEvents && queue.length > 0) {
    const candidate = queue.shift()
    if (candidate === undefined) break
    const body = batchBody([...selected, candidate])
    if (new TextEncoder().encode(body).length <= maxBytes) {
      selected.push(candidate)
      continue
    }
    if (selected.length > 0) {
      queue.unshift(candidate)
      break
    }
  }
  return selected
}

// A batch the network lost (offline, stalled, timed out, 5xx, 429) goes back
// without spending an attempt: a stall is not the events' fault. A batch the
// server refused spends one. Either way the queue stays within capacity.
export function requeueTelemetry(
  queue: QueuedTelemetryEvent[],
  failed: QueuedTelemetryEvent[],
  now: number,
  maxAgeMs: number,
  maxAttempts: number,
  capacity: number,
  failure: TelemetrySendFailure = 'rejected',
): void {
  const spent = failure === 'rejected' ? 1 : 0
  const retryable = failed
    .map((item) => ({ ...item, attempts: item.attempts + spent }))
    .filter((item) => item.attempts < maxAttempts && now - item.queuedAt <= maxAgeMs)
  queue.unshift(...retryable)
  const excess = queue.length - capacity
  if (excess > 0) queue.splice(0, excess)
}

export function batchBody(batch: QueuedTelemetryEvent[]): string {
  return JSON.stringify({ schema_version: 1, events: batch.map((item) => item.event) })
}

function discardExpired(queue: QueuedTelemetryEvent[], now: number, maxAgeMs: number): void {
  let keepFrom = 0
  while (keepFrom < queue.length && now - queue[keepFrom]!.queuedAt > maxAgeMs) keepFrom += 1
  if (keepFrom > 0) queue.splice(0, keepFrom)
}
