function isValidNumber(value: number): boolean {
  return Number.isFinite(value)
}

function chooseDecimalsByMagnitude(value: number): number {
  const v = Math.abs(value)
  if (v >= 100) return 2
  if (v >= 1) return 3
  if (v >= 0.1) return 4
  if (v >= 0.01) return 5
  return 6
}

type FormatOptions = {
  minDecimals?: number
  maxDecimals?: number
}

export function formatNumberAuto(value: number, options: FormatOptions = {}): string {
  if (!isValidNumber(value)) return '-'
  const { minDecimals = 0, maxDecimals = 8 } = options
  let decimals = chooseDecimalsByMagnitude(value)
  if (minDecimals > decimals) decimals = minDecimals
  decimals = Math.min(decimals, maxDecimals)
  return value.toFixed(decimals)
}

export function formatNumberShort(value: number, options: FormatOptions = {}): string {
  if (!isValidNumber(value)) return '-'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}k`
  return formatNumberAuto(value, options)
}

export function formatUsdShort(value: number): string {
  if (!isValidNumber(value)) return '-'
  const abs = Math.abs(value)
  if (abs >= 1_000) return `$${formatNumberShort(value)}`
  return `$${Math.round(value).toString()}`
}
