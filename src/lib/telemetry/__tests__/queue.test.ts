import assert from 'node:assert/strict'
import test from 'node:test'

import type { ClientTelemetryEvent, QueuedTelemetryEvent } from '../contract.ts'
import {
  batchBody,
  enqueueTelemetry,
  requeueTelemetry,
  takeTelemetryBatch,
  telemetryRetentionMs,
  telemetryRetryDelayMs,
  telemetryStatusFailure,
} from '../queue.ts'

test('bounded queue drops oldest observations without touching product flow', () => {
  const queue: QueuedTelemetryEvent[] = []
  enqueueTelemetry(queue, queued(1), 2)
  enqueueTelemetry(queue, queued(2), 2)
  enqueueTelemetry(queue, queued(3), 2)
  assert.deepEqual(
    queue.map((item) => item.event.session_sequence),
    [2, 3],
  )
})

test('batching respects both event and byte limits without dropping the remainder', () => {
  const queue = [queued(1), queued(2), queued(3)]
  const twoEventBytes = new TextEncoder().encode(batchBody(queue.slice(0, 2))).length
  const batch = takeTelemetryBatch(queue, 10, 100, 3, twoEventBytes)
  assert.deepEqual(
    batch.map((item) => item.event.session_sequence),
    [1, 2],
  )
  assert.deepEqual(
    queue.map((item) => item.event.session_sequence),
    [3],
  )
})

test('failed observations retry once, expire, and never grow beyond capacity', () => {
  const queue = [queued(3), queued(4)]
  requeueTelemetry(queue, [queued(1), queued(2)], 10, 100, 2, 3)
  assert.deepEqual(
    queue.map((item) => item.event.session_sequence),
    [2, 3, 4],
  )
  const failedAgain = queue.splice(0, 1)
  requeueTelemetry(queue, failedAgain, 10, 100, 2, 3)
  assert.deepEqual(
    queue.map((item) => item.event.session_sequence),
    [3, 4],
  )

  const expired = queued(5)
  expired.queuedAt = 0
  requeueTelemetry(queue, [expired], 200, 100, 2, 3)
  assert.deepEqual(
    queue.map((item) => item.event.session_sequence),
    [3, 4],
  )
})

// 2026-10-23: session 34b1 lost sequences 21-25, one batch, during a network
// stall. Each failed flush spent an attempt and two failures 15 s apart
// discarded the batch; the gateway's 120 s age bound discarded anything that
// waited longer.
test('a batch survives a long network stall and is sent in order afterwards', () => {
  const retention = telemetryRetentionMs(120_000)
  const queue = [queued(26)]
  let batch = [queued(21), queued(22), queued(23), queued(24), queued(25)]
  for (let failure = 1; failure <= 10; failure += 1) {
    requeueTelemetry(queue, batch, failure * 30_000, retention, 2, 128, 'transport')
    batch = takeTelemetryBatch(queue, failure * 30_000, retention, 5, 65_536)
    assert.deepEqual(
      batch.map((item) => item.event.session_sequence),
      [21, 22, 23, 24, 25],
    )
  }
  assert.ok(batch.every((item) => item.attempts === 0))
  assert.deepEqual(
    queue.map((item) => item.event.session_sequence),
    [26],
  )
})

test('server refusals still spend attempts so a poisoned batch cannot loop', () => {
  const queue: QueuedTelemetryEvent[] = []
  requeueTelemetry(queue, [queued(1)], 10, 100, 2, 3, 'rejected')
  assert.equal(queue[0]?.attempts, 1)
  requeueTelemetry(queue, queue.splice(0), 10, 100, 2, 3, 'rejected')
  assert.equal(queue.length, 0)
})

test('the stall queue stays bounded by capacity, dropping the oldest', () => {
  const queue = [queued(3), queued(4)]
  requeueTelemetry(queue, [queued(1), queued(2)], 10, 1_000, 2, 3, 'transport')
  assert.deepEqual(
    queue.map((item) => item.event.session_sequence),
    [2, 3, 4],
  )
})

test('network-shaped statuses retry for free; refusals do not', () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(telemetryStatusFailure(status), 'transport', String(status))
  }
  for (const status of [400, 401, 403, 404, 413, 422]) {
    assert.equal(telemetryStatusFailure(status), 'rejected', String(status))
  }
})

test('failed sends back off from the flush interval up to two minutes', () => {
  assert.equal(telemetryRetryDelayMs(15_000, 0), 15_000)
  assert.equal(telemetryRetryDelayMs(15_000, 1), 15_000)
  assert.equal(telemetryRetryDelayMs(15_000, 2), 30_000)
  assert.equal(telemetryRetryDelayMs(15_000, 3), 60_000)
  assert.equal(telemetryRetryDelayMs(15_000, 9), 120_000)
  assert.equal(telemetryRetentionMs(120_000), 30 * 60_000)
  assert.equal(telemetryRetentionMs(60 * 60_000), 60 * 60_000)
})

function queued(sequence: number): QueuedTelemetryEvent {
  return {
    event: {
      event_id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`,
      event_name: 'action_opened',
      occurred_at_ms: sequence,
      session_id: '00000000-0000-4000-8000-000000000000',
      session_sequence: sequence,
      client_release: '0.10.6',
      client_commit: '0123456',
      connection_state: 'connected',
      properties: {},
    } satisfies ClientTelemetryEvent,
    attempts: 0,
    queuedAt: sequence,
  }
}
