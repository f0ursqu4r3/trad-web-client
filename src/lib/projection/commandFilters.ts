import type {
  CommandLifecycle,
  CommandProjection,
  PositionProjection,
  ProjectionGraph,
} from '../gateway/index.ts'
import { commandSymbolIndex } from './presentation.ts'

export type ProjectionCommandPosition = 'open' | 'closed' | 'not_applicable'
export type ProjectionCommandRecent = 'any' | '12h' | 'day' | 'week' | 'month'

export interface ProjectionCommandFilters {
  kinds: string[]
  lifecycles: CommandLifecycle[]
  symbols: string[]
  positions: ProjectionCommandPosition[]
  recent: ProjectionCommandRecent
}

export function defaultProjectionCommandFilters(): ProjectionCommandFilters {
  return { kinds: [], lifecycles: [], symbols: [], positions: [], recent: 'any' }
}

export function filterProjectionCommands(
  commands: CommandProjection[],
  graph: ProjectionGraph | null,
  positions: PositionProjection[],
  filters: ProjectionCommandFilters,
  now = Date.now(),
): CommandProjection[] {
  if (graph === null) return commands
  const symbols = commandSymbolIndex(graph)
  return commands.filter((command) => {
    const symbol = symbols.get(command.command_id) ?? null
    return (
      includesOrAll(filters.kinds, command.accepted.kind) &&
      includesOrAll(filters.lifecycles, command.lifecycle) &&
      (filters.symbols.length === 0 || (symbol !== null && filters.symbols.includes(symbol))) &&
      includesOrAll(filters.positions, commandPosition(command, positions)) &&
      withinRecent(command.accepted_at, filters.recent, now)
    )
  })
}

export function commandPosition(
  command: CommandProjection,
  positions: PositionProjection[],
): ProjectionCommandPosition {
  const scopeIds = collectScopeIds(command.accepted.parameters)
  if (scopeIds.size === 0) return 'not_applicable'
  let found = false
  for (const position of positions) {
    for (const scopeId of scopeIds) {
      const exposure = position.owned_exposure[scopeId]
      if (exposure === undefined) continue
      found = true
      if (!isExactZero(exposure.remaining_quantity)) return 'open'
    }
  }
  return found ? 'closed' : 'not_applicable'
}

function collectScopeIds(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => collectScopeIds(item, found))
    return found
  }
  if (value === null || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    if (key === 'scope_id' && typeof child === 'string' && child !== '') found.add(child)
    else collectScopeIds(child, found)
  }
  return found
}

function isExactZero(value: string): boolean {
  return /^[+-]?0+(?:\.0+)?$/.test(value.trim())
}

function includesOrAll<T>(selected: T[], value: T): boolean {
  return selected.length === 0 || selected.includes(value)
}

function withinRecent(acceptedAt: number, recent: ProjectionCommandRecent, now: number): boolean {
  const durations: Record<Exclude<ProjectionCommandRecent, 'any'>, number> = {
    '12h': 12 * 60 * 60 * 1_000,
    day: 24 * 60 * 60 * 1_000,
    week: 7 * 24 * 60 * 60 * 1_000,
    month: 30 * 24 * 60 * 60 * 1_000,
  }
  return recent === 'any' || acceptedAt >= now - durations[recent]
}
