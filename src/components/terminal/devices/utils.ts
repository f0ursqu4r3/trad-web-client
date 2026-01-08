import { TrailingEntryLifecycle, TrailingEntryPhase } from '@/lib/ws/protocol'

export function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '-'
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

export function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) return '-'
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(qty)
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}

export function getPositionSideClass(side: unknown): string {
  const s = String(side).toUpperCase()
  return s === 'LONG' ? 'text-success' : 'text-danger'
}

export function formatSide(side: unknown): string {
  const s = String(side).toUpperCase()
  return s === 'LONG' ? 'Long' : 'Short'
}

export function getPhaseClass(phase: TrailingEntryPhase): string {
  return phase === TrailingEntryPhase.Triggered ? 'pill pill-ok' : 'pill'
}

export function getLifecycleClass(lifecycle: TrailingEntryLifecycle): string {
  switch (lifecycle) {
    case TrailingEntryLifecycle.Running:
      return 'pill pill-info'
    case TrailingEntryLifecycle.Completed:
      return 'pill pill-ok'
    case TrailingEntryLifecycle.SpawningChildren:
    case TrailingEntryLifecycle.ChildrenSpawned:
      return 'pill pill-warn'
    default:
      return 'pill'
  }
}
