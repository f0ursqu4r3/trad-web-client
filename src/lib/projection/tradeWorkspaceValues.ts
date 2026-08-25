import type { CommandProjection } from '../gateway/index.ts'

export function divideExact(numerator: string, denominator: string, precision: number): string {
  const left = decimalParts(numerator)
  const right = decimalParts(denominator)
  const scaledNumerator = left.coefficient * 10n ** BigInt(right.scale + precision)
  const scaledDenominator = right.coefficient * 10n ** BigInt(left.scale)
  if (scaledDenominator === 0n) throw new Error('cannot divide by zero')
  return decimalFromScaled(scaledNumerator / scaledDenominator, precision)
}

export function nestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value
  for (const key of path) current = objectValue(current)?.[key]
  return stringValue(current)
}

export function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function title(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}

export function compareCommands(left: CommandProjection, right: CommandProjection): number {
  return left.accepted_at - right.accepted_at || left.command_id.localeCompare(right.command_id)
}

export function terminalLifecycle(value: string): boolean {
  return ['succeeded', 'failed', 'canceled', 'completed', 'flat', 'rejected'].includes(value)
}

function decimalParts(value: string): { coefficient: bigint; scale: number } {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value)
  if (match === null) throw new Error(`invalid exact decimal: ${value}`)
  const fraction = match[3] ?? ''
  const sign = match[1] === '-' ? -1n : 1n
  return { coefficient: sign * BigInt(`${match[2]}${fraction}`), scale: fraction.length }
}

function decimalFromScaled(coefficient: bigint, scale: number): string {
  const negative = coefficient < 0n
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, '0')
  const whole = digits.slice(0, -scale)
  const fraction = digits.slice(-scale).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}`
}
