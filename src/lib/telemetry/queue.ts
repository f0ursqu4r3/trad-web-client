import type { QueuedTelemetryEvent } from './contract.ts'

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

export function requeueTelemetry(
  queue: QueuedTelemetryEvent[],
  failed: QueuedTelemetryEvent[],
  now: number,
  maxAgeMs: number,
  maxAttempts: number,
  capacity: number,
): void {
  const retryable = failed
    .map((item) => ({ ...item, attempts: item.attempts + 1 }))
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
