import type { CommandProjection, PositionProjection } from '../gateway/index.ts'
import { isExactZero } from '../exactDecimalMath.ts'

export function commandOwnershipScopeIds(command: CommandProjection): Set<string> {
  return collectScopeIds(command.accepted.parameters)
}

export function liveOwnedExposureScopeIds(positions: PositionProjection[]): Set<string> {
  const scopes = new Set<string>()
  for (const position of positions) {
    for (const exposure of Object.values(position.owned_exposure)) {
      if (!isExactZero(exposure.remaining_quantity)) scopes.add(exposure.scope_id)
    }
  }
  return scopes
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
