import assert from 'node:assert/strict'
import test from 'node:test'

import { ClientWorkMeter } from '../clientWork.ts'
import { ConnectionTimingObserver } from '../connectionTiming.ts'
import type { TelemetryRecord } from '../contract.ts'
import { safeTelemetryProperties, validTelemetryEventShape } from '../validation.ts'

const ACCOUNT = '10000000-0000-4000-8000-000000000001'

function harness() {
  let now = 0
  const records: TelemetryRecord[] = []
  const timing = new ConnectionTimingObserver(
    () => now,
    (record) => records.push(record),
  )
  return {
    timing,
    records,
    at(next: number) {
      now = next
    },
  }
}

test('the first connection is timed from page start and is not a reconnect', () => {
  const { timing, records, at } = harness()
  at(1_250.4)
  timing.socketReady('initial')
  at(2_000)
  timing.priceApplied(ACCOUNT, 'btc')
  at(4_250)
  timing.snapshotApplied(ACCOUNT, 6_500_000)
  timing.snapshotApplied(ACCOUNT, 10)
  at(5_000)
  timing.priceApplied(ACCOUNT, 'BTC')
  timing.priceApplied(ACCOUNT, 'ETH')
  assert.deepEqual(
    records.map((record) => record.properties),
    [
      { stage: 'socket_connected', elapsed_ms: 1_250, reconnect: false },
      { stage: 'first_price', elapsed_ms: 750, reconnect: false, market_symbol: 'BTC' },
      { stage: 'snapshot_applied', elapsed_ms: 3_000, reconnect: false, payload_bytes: 6_500_000 },
      { stage: 'first_price', elapsed_ms: 3_750, reconnect: false, market_symbol: 'ETH' },
    ],
  )
  assert.equal(records[2]?.accountId, ACCOUNT)
  for (const record of records) {
    assert.equal(record.eventName, 'connection_timing_measured')
    const properties = safeTelemetryProperties(record.properties!)
    assert.ok(properties)
    assert.equal(validTelemetryEventShape(record.eventName, properties), true)
  }
})

test('a reconnect is timed from the outage and measures each stage again', () => {
  const { timing, records, at } = harness()
  at(100)
  timing.socketReady('initial')
  timing.priceApplied(ACCOUNT, 'BTC')
  at(10_000)
  timing.socketLost()
  at(12_000)
  timing.socketLost()
  at(15_500)
  timing.socketReady('initial')
  at(16_000)
  timing.snapshotApplied(ACCOUNT, 42)
  timing.priceApplied(ACCOUNT, 'BTC')
  const after = records.slice(2).map((record) => record.properties)
  assert.deepEqual(after, [
    { stage: 'socket_connected', elapsed_ms: 5_500, reconnect: true },
    { stage: 'snapshot_applied', elapsed_ms: 500, reconnect: true, payload_bytes: 42 },
    { stage: 'first_price', elapsed_ms: 500, reconnect: true, market_symbol: 'BTC' },
  ])
})

test('a lease renewal is timed from the renewal start', () => {
  const { timing, records, at } = harness()
  timing.socketReady('initial')
  at(540_000)
  timing.rotationStarted()
  at(540_800)
  timing.socketReady('lease_rotation')
  assert.deepEqual(records[1]?.properties, {
    stage: 'socket_connected',
    elapsed_ms: 800,
    reconnect: true,
  })
})

test('nothing is measured while the socket is down', () => {
  const { timing, records } = harness()
  timing.snapshotApplied(ACCOUNT, 1)
  timing.priceApplied(ACCOUNT, 'BTC')
  assert.equal(records.length, 0)
})

test('client work is reported at most once per window, only while messages flow', () => {
  let now = 0
  const records: TelemetryRecord[] = []
  const meter = new ClientWorkMeter(
    () => now,
    (record) => records.push(record),
    60_000,
  )
  for (let index = 0; index < 100; index += 1) {
    now = index * 500
    // 94 cheap messages, five at 3.2 ms, one 40 ms snapshot.
    meter.message(1_000, index === 99 ? 40 : index >= 94 ? 3.2 : 0.3)
  }
  meter.longTask(73.6)
  meter.longTask(51)
  assert.equal(records.length, 0)
  now = 60_000
  meter.message(500, 0)
  assert.equal(records.length, 1)
  const properties = records[0]!.properties!
  assert.deepEqual(properties, {
    messages: 101,
    bytes: 100_500,
    apply_ms_p95: 4,
    apply_ms_max: 40,
    long_tasks: 2,
    longest_task_ms: 74,
    window_ms: 60_000,
  })
  assert.equal(records[0]!.eventName, 'client_work_measured')
  assert.equal(validTelemetryEventShape('client_work_measured', properties), true)

  now = 90_000
  meter.message(10, 1)
  assert.equal(records.length, 1)
  now = 120_000
  meter.message(10, 1)
  assert.equal(records.length, 2)
  assert.deepEqual(records[1]!.properties, {
    messages: 2,
    bytes: 20,
    apply_ms_p95: 1,
    apply_ms_max: 1,
    long_tasks: 0,
    longest_task_ms: 0,
    window_ms: 60_000,
  })
})

test('measurement events must carry exactly their own properties', () => {
  const timing = { stage: 'snapshot_applied', elapsed_ms: 10, reconnect: false } as const
  assert.equal(validTelemetryEventShape('connection_timing_measured', timing), false)
  assert.equal(
    validTelemetryEventShape('connection_timing_measured', { ...timing, payload_bytes: 9 }),
    true,
  )
  assert.equal(
    validTelemetryEventShape('connection_timing_measured', {
      stage: 'socket_connected',
      elapsed_ms: 10,
      reconnect: false,
      payload_bytes: 9,
    }),
    false,
  )
  assert.equal(
    validTelemetryEventShape('connection_timing_measured', {
      stage: 'first_price',
      elapsed_ms: 10,
      reconnect: true,
    }),
    false,
  )
  assert.equal(
    validTelemetryEventShape('connection_timing_measured', {
      stage: 'first_price',
      elapsed_ms: 10,
      reconnect: true,
      market_symbol: 'BTC',
    }),
    true,
  )
  assert.equal(
    validTelemetryEventShape('client_work_measured', {
      messages: 1,
      bytes: 1,
      apply_ms_p95: 1,
      apply_ms_max: 1,
      long_tasks: 0,
      longest_task_ms: 0,
    }),
    false,
  )
  assert.equal(safeTelemetryProperties({ elapsed_ms: -1 }), null)
  assert.equal(safeTelemetryProperties({ elapsed_ms: 1.5 }), null)
  assert.equal(
    validTelemetryEventShape('connection_timing_measured', {
      stage: 'socket_connected',
      elapsed_ms: 1,
      reconnect: 'no' as unknown as boolean,
    }),
    false,
  )
})
