import { currentProductRelease } from '@/lib/releases'

import type { TelemetryConnectionState } from './catalog.ts'
import type {
  ClientTelemetryEvent,
  QueuedTelemetryEvent,
  TelemetryClientConfig,
  TelemetryRecord,
} from './contract.ts'
import { safeTelemetryProperties } from './validation.ts'
import { batchBody, enqueueTelemetry, requeueTelemetry, takeTelemetryBatch } from './queue.ts'

const CONFIG_PATH = '/api/telemetry/config'
const EVENTS_PATH = '/api/telemetry/events'
const MAX_SEND_ATTEMPTS = 2
const PRECONFIG_QUEUE_CAPACITY = 32

export class TelemetryCollector {
  private config: TelemetryClientConfig | null = null
  private readonly sessionId = crypto.randomUUID()
  private sequence = 0
  private connectionState: TelemetryConnectionState = navigator.onLine ? 'unavailable' : 'offline'
  private queue: QueuedTelemetryEvent[] = []
  private preconfigQueue: TelemetryRecord[] = []
  private flushTimer: number | null = null
  private flushing = false

  async start(): Promise<void> {
    if (this.config !== null) return
    try {
      const response = await fetch(CONFIG_PATH, { credentials: 'include' })
      if (!response.ok) {
        this.preconfigQueue = []
        return
      }
      const config = (await response.json()) as TelemetryClientConfig
      if (!validConfig(config)) {
        this.preconfigQueue = []
        return
      }
      this.config = config
    } catch {
      this.preconfigQueue = []
      return
    }
    const config = this.config
    if (!config.collection_enabled) {
      this.preconfigQueue = []
      return
    }
    this.record({ eventName: 'session_started' })
    const pending = this.preconfigQueue.splice(0)
    for (const record of pending) this.record(record)
    this.scheduleFlush()
  }

  stop(): void {
    if (!this.enabled()) return
    this.record({ eventName: 'session_ended' })
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer)
    this.flushTimer = null
    void this.flush(true)
  }

  setConnectionState(next: TelemetryConnectionState): void {
    if (this.connectionState === next) return
    const previous = this.connectionState
    this.connectionState = next
    this.record({
      eventName: 'websocket_state_changed',
      properties: { previous_state: previous, state: next },
    })
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
      if (this.queue.length >= config.max_events_per_batch) void this.flush(false)
      else this.scheduleFlush()
    } catch {
      // Observation is fail-open and must never escape into product control flow.
    }
  }

  async flush(keepalive: boolean): Promise<void> {
    const config = this.config
    if (config?.collection_enabled !== true || this.flushing || this.queue.length === 0) return
    this.flushing = true
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer)
    this.flushTimer = null
    const batch = takeTelemetryBatch(
      this.queue,
      Date.now(),
      config.max_event_age_ms,
      config.max_events_per_batch,
      config.max_batch_bytes,
    )
    if (batch.length === 0) {
      this.flushing = false
      return
    }
    const body = batchBody(batch)
    try {
      const response = await fetch(EVENTS_PATH, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive,
      })
      if (!response.ok) throw new Error('telemetry ingestion rejected')
    } catch {
      requeueTelemetry(
        this.queue,
        batch,
        Date.now(),
        config.max_event_age_ms,
        MAX_SEND_ATTEMPTS,
        config.queue_capacity,
      )
    } finally {
      this.flushing = false
      this.scheduleFlush()
    }
  }

  private enabled(): boolean {
    return this.config?.collection_enabled === true
  }

  private scheduleFlush(): void {
    if (!this.enabled() || this.flushTimer !== null || this.queue.length === 0) return
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null
      void this.flush(false)
    }, this.config!.flush_interval_ms)
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
