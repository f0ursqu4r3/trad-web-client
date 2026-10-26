// Quantities for the engineering reports and the one unit rule they are
// printed with. Report data stores each value in a base unit (seconds or
// bytes); the formatter picks the unit, so every table follows the same rule:
// durations in µs below 1 ms, ms below 1 s, s from 1 s; sizes in B, KB, MB, GB
// (decimal), or MiB/GiB for allocator counts; 3 significant digits, never
// rounding away whole digits.

export type Method = 'production' | 'rehearsal' | 'benchmark' | 'load' | 'probe' | 'estimate'

export type Amount = number | readonly [number, number]

export type QuantityKind = 'time' | 'bytes' | 'mib' | 'count'

export interface Quantity {
  kind: QuantityKind
  // Several values print joined by " / " (for example p50 / p99).
  values: readonly Amount[]
  // Printed after the unit, e.g. "/s" or " stmts".
  suffix?: string
  approx?: boolean
  // Throughput: more is the improvement.
  higherIsBetter?: boolean
}

export interface TextValue {
  kind: 'text'
  text: string
}

export type Value = Quantity | TextValue

export function us(...values: Amount[]): Quantity {
  return { kind: 'time', values: values.map((value) => scale(value, 1e-6)) }
}

export function ms(...values: Amount[]): Quantity {
  return { kind: 'time', values: values.map((value) => scale(value, 1e-3)) }
}

export function sec(...values: Amount[]): Quantity {
  return { kind: 'time', values }
}

export function bytes(...values: Amount[]): Quantity {
  return { kind: 'bytes', values }
}

export function kb(...values: Amount[]): Quantity {
  return { kind: 'bytes', values: values.map((value) => scale(value, 1e3)) }
}

export function mb(...values: Amount[]): Quantity {
  return { kind: 'bytes', values: values.map((value) => scale(value, 1e6)) }
}

export function gb(...values: Amount[]): Quantity {
  return { kind: 'bytes', values: values.map((value) => scale(value, 1e9)) }
}

export function mib(...values: Amount[]): Quantity {
  return { kind: 'mib', values }
}

export function count(...values: Amount[]): Quantity {
  return { kind: 'count', values }
}

export function text(value: string): TextValue {
  return { kind: 'text', text: value }
}

export function per(quantity: Quantity, suffix: string): Quantity {
  return { ...quantity, suffix }
}

export function approx(quantity: Quantity): Quantity {
  return { ...quantity, approx: true }
}

export function throughput(quantity: Quantity): Quantity {
  return { ...quantity, higherIsBetter: true }
}

function scale(value: Amount, factor: number): Amount {
  if (typeof value === 'number') return value * factor
  return [value[0] * factor, value[1] * factor]
}

// 3 significant digits; whole digits are never rounded away (218.8 -> 219,
// 7,964 -> 7,964); trailing zeros are dropped.
export function formatNumber(value: number): string {
  const magnitude = Math.abs(value)
  let decimals = 0
  if (magnitude > 0 && magnitude < 100) {
    decimals = Math.max(0, 2 - Math.floor(Math.log10(magnitude)))
  }
  const rounded = Number(value.toFixed(decimals))
  return rounded.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

interface Unit {
  label: string
  size: number
}

const timeUnits: Unit[] = [
  { label: 's', size: 1 },
  { label: 'ms', size: 1e-3 },
  { label: 'µs', size: 1e-6 },
]
const byteUnits: Unit[] = [
  { label: 'GB', size: 1e9 },
  { label: 'MB', size: 1e6 },
  { label: 'KB', size: 1e3 },
  { label: 'B', size: 1 },
]
const mibUnits: Unit[] = [
  { label: 'GiB', size: 1024 },
  { label: 'MiB', size: 1 },
]
const countUnits: Unit[] = [{ label: '', size: 1 }]

function unitsFor(kind: QuantityKind): Unit[] {
  if (kind === 'time') return timeUnits
  if (kind === 'bytes') return byteUnits
  if (kind === 'mib') return mibUnits
  return countUnits
}

// Zero has no magnitude to pick a unit from; it prints in the everyday one.
const zeroUnits: Record<QuantityKind, string> = { time: 'ms', bytes: 'B', mib: 'MiB', count: '' }

// The largest unit the value reaches; a range uses its upper end.
function unitFor(kind: QuantityKind, amount: Amount): Unit {
  const units = unitsFor(kind)
  const value = Math.abs(typeof amount === 'number' ? amount : amount[1])
  if (value === 0) return units.find((unit) => unit.label === zeroUnits[kind])!
  // GiB starts at 10 GiB so allocator figures read in MiB like their sources.
  const threshold = (unit: Unit): number => (unit.label === 'GiB' ? unit.size * 10 : unit.size)
  return units.find((unit) => value >= threshold(unit)) ?? units[units.length - 1]!
}

function formatAmount(amount: Amount, unit: Unit): string {
  if (typeof amount === 'number') return formatNumber(amount / unit.size)
  return `${formatNumber(amount[0] / unit.size)}–${formatNumber(amount[1] / unit.size)}`
}

function withUnit(number: string, unit: Unit): string {
  return unit.label ? `${number} ${unit.label}` : number
}

export function formatValue(value: Value): string {
  if (value.kind === 'text') return value.text
  const units = value.values.map((amount) => unitFor(value.kind, amount))
  const shared = units.every((unit) => unit.label === units[0]!.label)
  const parts = value.values.map((amount, index) => {
    const number = formatAmount(amount, units[index]!)
    return shared ? number : withUnit(number, units[index]!)
  })
  let result = parts.join(' / ')
  if (shared) result = withUnit(result, units[0]!)
  if (value.approx) result = `~${result}`
  return `${result}${value.suffix ?? ''}`
}

function amountAt(value: Value, index: number): { kind: QuantityKind; amount: number } | null {
  if (value.kind === 'text') return null
  const amount = value.values[index]
  if (amount === undefined) return null
  return { kind: value.kind, amount: typeof amount === 'number' ? amount : amount[1] }
}

// How many times better after is than before: before / after, or after /
// before for throughput. A single value compares directly; for several
// (p50 / p99) the caller names which one, by index. Ranges compare their
// upper ends. No factor when nothing improved or after is zero.
export function improvementFactor(
  before: Value | null,
  after: Value,
  index: number | null = null,
): number | null {
  if (before === null || before.kind === 'text' || after.kind === 'text') return null
  if (before.suffix !== after.suffix) return null
  const single = before.values.length === 1 && after.values.length === 1
  if (index === null && !single) return null
  const from = amountAt(before, index ?? 0)
  const to = amountAt(after, index ?? 0)
  if (from === null || to === null || from.kind !== to.kind) return null
  if (before.higherIsBetter !== after.higherIsBetter) return null
  const [worse, better] = after.higherIsBetter ? [to.amount, from.amount] : [from.amount, to.amount]
  if (better <= 0 || worse <= better) return null
  return worse / better
}

// Two significant digits below 100 (9.3x, 34x), three above (1,360x).
export function formatFactor(factor: number | null): string {
  if (factor === null) return ''
  const digits = factor < 100 ? 2 : 3
  const rounded = Number(factor.toPrecision(digits))
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: 1 })}x`
}

// Report structure, shared by the report view and its tables.
export interface ReportRow {
  // Rows sharing a group (an account fixture, say) print it once.
  group?: string
  measure: string
  // A row with one figure (no before) leaves before null.
  before: Value | null
  after: Value
  method: Method
  conditions?: string
  // Rows with several figures name the one the factor compares.
  factorAt?: { index: number; label: string }
  notShipped?: boolean
}

export interface ReportTable {
  // Column heading for the rows' groups, when they have one.
  groupLabel?: string
  measureLabel: string
  rows: ReportRow[]
}

export interface Headline {
  label: string
  before: Value
  after: Value
  note: string
  method: Method
}

export interface ReportSection {
  id: string
  title: string
  line: string
  tables: ReportTable[]
  chart?: 'deploy-pause'
  caption?: string
  list?: string[]
}
