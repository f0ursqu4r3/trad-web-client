import type { TelemetryProperties } from './catalog.ts'
import type { TelemetryBatchResult, TelemetryRecord } from './contract.ts'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  'source',
  'visibility_state',
  'command_lifecycle',
  'diagnostic_fingerprint',
  'gap_size',
  'queue_depth',
  'retry_count',
  'sampled',
])

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
      safe[key] = value
      continue
    }
    if (typeof value !== 'boolean') return null
    safe[key] = value
  }
  return safe as TelemetryProperties
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
