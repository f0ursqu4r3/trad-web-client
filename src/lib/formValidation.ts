import { exactDecimal, normalizedSymbol } from '@/lib/engineCommands/form'

export function requiredText(value: string, label: string): string | null {
  return value.trim() === '' ? `${label} is required` : null
}

export function symbolError(value: string): string | null {
  return validationError(() => normalizedSymbol(value))
}

export function decimalError(
  value: string,
  label: string,
  options: { optional?: boolean; allowZero?: boolean } = {},
): string | null {
  if (options.optional && value.trim() === '') return null
  return validationError(() => exactDecimal(value, label, options.allowZero))
}

export function integerError(
  value: string,
  label: string,
  minimum: number,
  maximum?: number,
): string | null {
  if (!/^\d+$/.test(value.trim())) return `${label} must be a whole number`
  const parsed = Number(value)
  if (parsed < minimum || (maximum !== undefined && parsed > maximum)) {
    return maximum === undefined
      ? `${label} must be at least ${minimum}`
      : `${label} must be between ${minimum} and ${maximum}`
  }
  return null
}

export function validationError(operation: () => unknown): string | null {
  try {
    operation()
    return null
  } catch (error) {
    return error instanceof Error ? sentenceCase(error.message) : String(error)
  }
}

function sentenceCase(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1)
}
