export interface DetailRow {
  label: string
  value: string
  tone?: 'normal' | 'warning' | 'danger' | 'success'
}

export function detail(label: string, value: unknown): DetailRow {
  return { label, value: formatProjectionValue(value) }
}

export function optionalDetail(label: string, value: unknown): DetailRow | null {
  return value === null || value === undefined ? null : detail(label, value)
}

export function recordDetail(
  label: string,
  value: Record<string, unknown>,
  key: string,
): DetailRow | null {
  return optionalDetail(label, value[key])
}

export function compactDetails(values: Array<DetailRow | null>): DetailRow[] {
  return values.filter((value): value is DetailRow => value !== null)
}

export function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

export function formatTimestamp(value: number): string {
  return new Date(value).toLocaleString()
}

export function formatProjectionValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null || value === undefined) return '-'
  if (Array.isArray(value)) return value.map(formatProjectionValue).join(', ')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${humanize(key)}: ${formatProjectionValue(item)}`)
      .join(', ')
  }
  return String(value)
}

export function humanize(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}
