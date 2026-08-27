import type {
  TelemetryConnectionState,
  TelemetryEventName,
  TelemetryProperties,
} from './catalog.ts'

export interface TelemetryClientConfig {
  schema_version: number
  collection_enabled: boolean
  max_batch_bytes: number
  max_events_per_batch: number
  flush_interval_ms: number
  queue_capacity: number
  max_event_age_ms: number
}

export interface TelemetryContext {
  accountId?: string | null
  tradeId?: string | null
  projectionRevision?: number | null
  actionAttemptId?: string | null
  requestId?: string | null
  commandId?: string | null
}

export interface TelemetryRecord extends TelemetryContext {
  eventName: TelemetryEventName
  properties?: TelemetryProperties
}

export interface ClientTelemetryEvent {
  event_id: string
  event_name: TelemetryEventName
  occurred_at_ms: number
  session_id: string
  session_sequence: number
  account_id?: string
  trade_id?: string
  projection_revision?: number
  client_release: string
  client_commit: string
  connection_state: TelemetryConnectionState
  action_attempt_id?: string
  request_id?: string
  command_id?: string
  properties: TelemetryProperties
}

export interface QueuedTelemetryEvent {
  event: ClientTelemetryEvent
  attempts: number
  queuedAt: number
}
