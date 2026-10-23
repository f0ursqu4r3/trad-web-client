import { currentProductRelease } from '@/lib/releases'

import type { TelemetryConnectionState } from './catalog.ts'
import type {
  ClientTelemetryEvent,
  QueuedTelemetryEvent,
  TelemetryClientConfig,
  TelemetryRecord,
} from './contract.ts'
import {
  safeTelemetryProperties,
  validTelemetryBatchResult,
  validTelemetryContextIds,
  validTelemetryEventShape,
} from './validation.ts'
import {
  batchBody,
  enqueueTelemetry,
  requeueTelemetry,
  takeTelemetryBatch,
  telemetryRetentionMs,
  telemetryRetryDelayMs,
  telemetryStatusFailure,
  type TelemetrySendFailure,
} from './queue.ts'

const CONFIG_PATH = '/api/telemetry/config'
const EVENTS_PATH = '/api/telemetry/events'
// Attempts a batch may spend on server refusals; network failures spend none.
const MAX_SEND_ATTEMPTS = 2
const PRECONFIG_QUEUE_CAPACITY = 32
// A stalled request gives the batch back after this long instead of holding
// every later flush behind it.
const SEND_TIMEOUT_MS = 10_000
// Browsers cap keepalive bodies (all in flight together) at 64 KiB.
const KEEPALIVE_MAX_BYTES = 60_000
const CONFIG_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

class TelemetrySendError extends Error {
  readonly failure: TelemetrySendFailure

  constructor(failure: TelemetrySendFailure, message: string) {
    super(message)
    this.failure = failure
  }
}

export class TelemetryCollector {
  private config: TelemetryClientConfig | null = null
  private readonly sessionId = crypto.randomUUID()
  private sequence = 0
  private connectionState: TelemetryConnectionState = navigator.onLine ? 'unavailable' : 'offline'
  private queue: QueuedTelemetryEvent[] = []
  private preconfigQueue: TelemetryRecord[] = []
  private flushTimer: number | null = null
  private flushing = false
  // The batch being posted, so a page hide can still hand it off.
  private inFlight: QueuedTelemetryEvent[] = []
  private sendFailures = 0
  private configAttempts = 0

  async start(): Promise<void> {
    if (this.config !== null) return
    let response: Response
    try {
      response = await fetch(CONFIG_PATH, { credentials: 'include' })
    } catch {
      this.retryStart()
      return
    }
    if (!response.ok) {
      // A stalled or failing gateway may answer later; a refusal is final.
      if (telemetryStatusFailure(response.status) === 'transport') this.retryStart()
      else this.preconfigQueue = []
      return
    }
    let config: TelemetryClientConfig
    try {
      config = (await response.json()) as TelemetryClientConfig
    } catch {
      this.preconfigQueue = []
      return
    }
    if (!validConfig(config)) {
      this.preconfigQueue = []
      return
    }
    this.config = config
    if (!config.collection_enabled) {
      this.preconfigQueue = []
      return
    }
    this.record({ eventName: 'session_started' })
    const pending = this.preconfigQueue.splice(0)
    for (const record of pending) this.record(record)
    this.scheduleFlush()
  }

  // Config could not be fetched (offline at load): keep the early events and
  // try again a few times instead of going quiet for the whole session.
  private retryStart(): void {
    const delay = CONFIG_RETRY_DELAYS_MS[this.configAttempts]
    this.configAttempts += 1
    if (delay === undefined) {
      this.preconfigQueue = []
      return
    }
    window.setTimeout(() => void this.start(), delay)
  }

  stop(): void {
    if (!this.enabled()) return
    this.record({ eventName: 'session_ended' })
    this.sendBeforeUnload()
  }

  // The page is being hidden or unloaded: hand the queue, and any batch still
  // in flight, to a keepalive request that outlives the page. The gateway
  // deduplicates by event id, so a batch that also lands normally is harmless.
  private sendBeforeUnload(): void {
    const config = this.config
    if (config?.collection_enabled !== true) return
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer)
    this.flushTimer = null
    const pending = [...this.inFlight, ...this.queue]
    if (pending.length === 0) return
    const batch = takeTelemetryBatch(
      pending,
      Date.now(),
      telemetryRetentionMs(config.max_event_age_ms),
      config.max_events_per_batch,
      Math.min(config.max_batch_bytes, KEEPALIVE_MAX_BYTES),
    )
    if (batch.length === 0) return
    try {
      void fetch(EVENTS_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: batchBody(batch),
        keepalive: true,
      }).catch(() => undefined)
    } catch {
      // Observation never escapes into page teardown.
    }
  }

  setConnectionState(next: TelemetryConnectionState): void {
    if (this.connectionState === next) return
    const previous = this.connectionState
    this.connectionState = next
    this.record({
      eventName: 'websocket_state_changed',
      properties: { previous_state: previous, state: next },
    })
    // The network is back: send what waited through the outage now.
    if (next === 'connected') this.flushSoon()
  }

  // Resets the failure backoff and flushes on the next turn.
  flushSoon(): void {
    if (!this.enabled()) return
    this.sendFailures = 0
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer)
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, 0)
  }

  record(record: TelemetryRecord): void {
    try {
      const config = this.config
      if (config === null) {
        this.preconfigQueue.push(record)
        if (this.preconfigQueue.length > PRECONFIG_QUEUE_CAPACITY) this.preconfigQueue.shift()
        return
      }
      if (!config.collection_enabled) return
      const properties = safeTelemetryProperties(record.properties ?? {})
      if (properties === null) return
      if (!validTelemetryEventShape(record.eventName, properties)) return
      if (!validTelemetryContextIds(record)) return
      const queuedAt = Date.now()
      const release = currentProductRelease(false).version
      const event: ClientTelemetryEvent = {
        event_id: crypto.randomUUID(),
        event_name: record.eventName,
        occurred_at_ms: queuedAt,
        session_id: this.sessionId,
        session_sequence: ++this.sequence,
        client_release: release,
        client_commit: clientCommit(),
        connection_state: this.connectionState,
        properties,
        ...(record.accountId ? { account_id: record.accountId } : {}),
        ...(record.tradeId ? { trade_id: record.tradeId } : {}),
        ...(record.projectionRevision != null
          ? { projection_revision: record.projectionRevision }
          : {}),
        ...(record.actionAttemptId ? { action_attempt_id: record.actionAttemptId } : {}),
        ...(record.requestId ? { request_id: record.requestId } : {}),
        ...(record.commandId ? { command_id: record.commandId } : {}),
      }
      enqueueTelemetry(this.queue, { event, attempts: 0, queuedAt }, config.queue_capacity)
      if (this.queue.length >= config.max_events_per_batch) void this.flush()
      else this.scheduleFlush()
    } catch {
      // Observation is fail-open and must never escape into product control flow.
    }
  }

  // keepalive: the tab is being hidden; the request may outlive the page.
  async flush(keepalive = false): Promise<void> {
    const config = this.config
    if (config?.collection_enabled !== true || this.flushing || this.queue.length === 0) return
    this.flushing = true
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer)
    this.flushTimer = null
    const retentionMs = telemetryRetentionMs(config.max_event_age_ms)
    const batch = takeTelemetryBatch(
      this.queue,
      Date.now(),
      retentionMs,
      config.max_events_per_batch,
      keepalive ? Math.min(config.max_batch_bytes, KEEPALIVE_MAX_BYTES) : config.max_batch_bytes,
    )
    if (batch.length === 0) {
      this.flushing = false
      return
    }
    this.inFlight = batch
    try {
      await sendBatch(batchBody(batch), batch.length, keepalive)
      this.sendFailures = 0
    } catch (error) {
      const failure = error instanceof TelemetrySendError ? error.failure : 'transport'
      if (failure === 'transport') this.sendFailures += 1
      requeueTelemetry(
        this.queue,
        batch,
        Date.now(),
        retentionMs,
        MAX_SEND_ATTEMPTS,
        config.queue_capacity,
        failure,
      )
    } finally {
      this.inFlight = []
      this.flushing = false
      this.scheduleFlush()
    }
  }

  private enabled(): boolean {
    return this.config?.collection_enabled === true
  }

  private scheduleFlush(): void {
    if (!this.enabled() || this.flushTimer !== null || this.queue.length === 0) return
    this.flushTimer = window.setTimeout(
      () => {
        this.flushTimer = null
        void this.flush()
      },
      telemetryRetryDelayMs(this.config!.flush_interval_ms, this.sendFailures),
    )
  }
}

// Posts one batch. A network error, a timeout or a network-shaped status
// throws a 'transport' failure; a refusal or an unusable answer throws
// 'rejected'.
async function sendBatch(body: string, events: number, keepalive: boolean): Promise<void> {
  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), SEND_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(EVENTS_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive,
      signal: abort.signal,
    })
  } catch {
    throw new TelemetrySendError('transport', 'telemetry request failed or timed out')
  } finally {
    window.clearTimeout(timer)
  }
  if (!response.ok) {
    throw new TelemetrySendError(
      telemetryStatusFailure(response.status),
      `telemetry ingestion answered ${response.status}`,
    )
  }
  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw new TelemetrySendError('transport', 'telemetry ingestion answer was cut off')
  }
  if (!validTelemetryBatchResult(result)) {
    throw new TelemetrySendError('rejected', 'telemetry ingestion returned invalid result')
  }
  if (result.invalid === 0 && result.accepted + result.duplicate + result.dropped < events) {
    throw new TelemetrySendError('rejected', 'telemetry ingestion dropped retryable events')
  }
}

function clientCommit(): string {
  const configured = import.meta.env.VITE_APP_BUILD?.trim()
  return configured && /^[0-9a-f]{7,64}$/i.test(configured) ? configured : '0000000'
}

function validConfig(value: TelemetryClientConfig): boolean {
  return (
    value.schema_version === 1 &&
    typeof value.collection_enabled === 'boolean' &&
    value.max_batch_bytes >= 4096 &&
    value.max_events_per_batch > 0 &&
    value.queue_capacity > 0 &&
    value.flush_interval_ms >= 1000 &&
    value.max_event_age_ms >= value.flush_interval_ms
  )
}
