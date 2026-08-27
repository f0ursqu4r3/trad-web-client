import assert from 'node:assert/strict'
import test from 'node:test'

import type { ClientTelemetryEvent, QueuedTelemetryEvent } from '../contract.ts'
import { batchBody, enqueueTelemetry, requeueTelemetry, takeTelemetryBatch } from '../queue.ts'

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
