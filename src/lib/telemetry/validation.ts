import type { TelemetryEventName, TelemetryProperties } from './catalog.ts'
import type { TelemetryBatchResult, TelemetryRecord } from './contract.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const propertyNames = new Set<keyof TelemetryProperties>([
  'action_kind',
  'blocker_code',
  'route_template',
  'tab_id',
  'section_id',
  'control_id',
  'field_name',
  'interaction',
  'state',
  'previous_state',
  'outcome_code',
  'reason_code',
  'response_code',
  'duration_bucket',
  'market_symbol',
  'market_sample_age_bucket',
  'sample_count',
  'source',
  'visibility_state',
  'command_lifecycle',
  'diagnostic_fingerprint',
  'gap_size',
  'queue_depth',
  'retry_count',
  'sampled',
  'stage',
  'elapsed_ms',
  'payload_bytes',
  'reconnect',
  'messages',
  'bytes',
  'apply_ms_p95',
  'apply_ms_max',
  'long_tasks',
  'longest_task_ms',
  'window_ms',
])

// Counts and durations that are never negative.
const nonNegativeNames = new Set<string>([
  'sample_count',
  'elapsed_ms',
  'payload_bytes',
  'messages',
  'bytes',
  'apply_ms_p95',
  'apply_ms_max',
  'long_tasks',
  'longest_task_ms',
  'window_ms',
])

const CONNECTION_TIMING_STAGES = new Set(['socket_connected', 'snapshot_applied', 'first_price'])
const CLIENT_WORK_PROPERTIES = [
  'messages',
  'bytes',
  'apply_ms_p95',
  'apply_ms_max',
  'long_tasks',
  'longest_task_ms',
  'window_ms',
] as const

export function safeTelemetryProperties(
  properties: TelemetryProperties,
): TelemetryProperties | null {
  const entries = Object.entries(properties)
  if (entries.length > 16) return null
  const safe: Record<string, string | number | boolean> = {}
  for (const [key, value] of entries) {
    if (!propertyNames.has(key as keyof TelemetryProperties)) return null
    if (typeof value === 'string') {
      if (value.length === 0 || value.length > 128 || !/^[A-Za-z0-9_.:/{}-]+$/.test(value)) {
        return null
      }
      safe[key] = value
      continue
    }
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) return null
      if (nonNegativeNames.has(key) && value < 0) return null
      safe[key] = value
      continue
    }
    if (typeof value !== 'boolean') return null
    safe[key] = value
  }
  return safe as TelemetryProperties
}

// The measurement events carry exactly their own properties; the gateway
// validates the same shapes.
export function validTelemetryEventShape(
  eventName: TelemetryEventName,
  properties: TelemetryProperties,
): boolean {
  if (eventName === 'connection_timing_measured') return validConnectionTiming(properties)
  if (eventName === 'client_work_measured') return validClientWork(properties)
  return true
}

function validConnectionTiming(properties: TelemetryProperties): boolean {
  const stage = properties.stage
  if (stage === undefined || !CONNECTION_TIMING_STAGES.has(stage)) return false
  if (!wholeNumber(properties.elapsed_ms) || typeof properties.reconnect !== 'boolean') {
    return false
  }
  const allowed = new Set<string>(['stage', 'elapsed_ms', 'reconnect'])
  if (stage === 'snapshot_applied') {
    if (!wholeNumber(properties.payload_bytes)) return false
    allowed.add('payload_bytes')
  }
  if (stage === 'first_price') {
    if (typeof properties.market_symbol !== 'string') return false
    allowed.add('market_symbol')
  }
  return Object.keys(properties).every((key) => allowed.has(key))
}

function validClientWork(properties: TelemetryProperties): boolean {
  const keys = Object.keys(properties)
  return (
    keys.length === CLIENT_WORK_PROPERTIES.length &&
    CLIENT_WORK_PROPERTIES.every((key) => wholeNumber(properties[key]))
  )
}

function wholeNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function validTelemetryContextIds(record: TelemetryRecord): boolean {
  return [
    record.accountId,
    record.tradeId,
    record.actionAttemptId,
    record.requestId,
    record.commandId,
  ].every((value) => value == null || UUID_PATTERN.test(value))
}

export function validTelemetryBatchResult(value: unknown): value is TelemetryBatchResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Partial<TelemetryBatchResult>
  return (
    typeof result.collection_enabled === 'boolean' &&
    nonnegativeInteger(result.accepted) &&
    nonnegativeInteger(result.duplicate) &&
    nonnegativeInteger(result.invalid) &&
    nonnegativeInteger(result.dropped) &&
    nonnegativeInteger(result.sequence_gaps)
  )
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
