import type {
  BrowserAccountSnapshot,
  CommandProjection,
  OwnedExposureProjection,
  PositionProjection,
} from '../gateway/index.ts'
import { commandOwnershipScopeIds } from './ownership.ts'
import type { TradeSeed } from './tradeWorkspaceTypes.ts'
import { arrayValue, compareCommands, objectValue, stringValue } from './tradeWorkspaceValues.ts'

const CREATION_KINDS = new Set([
  'place_order',
  'place_execution_group',
  'place_chase',
  'place_trailing_entry',
])

export function tradeSeeds(commands: CommandProjection[]): TradeSeed[] {
  const seeds = new Map<string, TradeSeed>()
  for (const command of [...commands].sort(compareCommands)) {
    if (!CREATION_KINDS.has(command.accepted.kind)) continue
    for (const scopeId of creationScopeIds(command)) {
      if (!seeds.has(scopeId)) seeds.set(scopeId, { scopeId, primaryCommand: command })
    }
  }
  return [...seeds.values()]
}

export function relatedCommandIds(snapshot: BrowserAccountSnapshot, seed: TradeSeed): Set<string> {
  const ids = new Set([seed.primaryCommand.command_id])
  for (const command of snapshot.commands) {
    if (commandOwnershipScopeIds(command).has(seed.scopeId)) ids.add(command.command_id)
  }
  for (const workflow of snapshot.close_workflows) {
    if (workflow.requested_reductions.some((reduction) => reduction.scope_id === seed.scopeId)) {
      ids.add(workflow.command_id)
    }
  }
  for (const workflow of snapshot.entry_cancellations) {
    if (
      workflow.takeover_exposure_scope_ids?.includes(seed.scopeId) ||
      workflow.affected_command_ids.includes(seed.primaryCommand.command_id)
    ) {
      ids.add(workflow.command_id)
    }
  }
  for (const workflow of snapshot.flatten_workflows) {
    if (workflow.affected_command_ids.includes(seed.primaryCommand.command_id)) {
      ids.add(workflow.command_id)
    }
  }
  return ids
}

export function descendantOrderIds(
  snapshot: BrowserAccountSnapshot,
  commandIds: Set<string>,
): Set<string> {
  const reached = new Set([...commandIds].map((id) => `command:${id}`))
  let changed = true
  while (changed) {
    changed = false
    for (const edge of snapshot.relationships) {
      const parent = `${edge.parent.kind}:${edge.parent.id}`
      const child = `${edge.child.kind}:${edge.child.id}`
      if (!reached.has(parent) || reached.has(child)) continue
      reached.add(child)
      changed = true
    }
  }
  return new Set(
    [...reached].filter((key) => key.startsWith('order:')).map((key) => key.slice('order:'.length)),
  )
}

export function indexPositions(
  positions: PositionProjection[],
): Map<string, { position: PositionProjection; exposure: OwnedExposureProjection }> {
  const result = new Map<
    string,
    { position: PositionProjection; exposure: OwnedExposureProjection }
  >()
  for (const position of positions) {
    for (const exposure of Object.values(position.owned_exposure)) {
      result.set(exposure.scope_id, { position, exposure })
    }
  }
  return result
}

function creationScopeIds(command: CommandProjection): Set<string> {
  const parameters = command.accepted.parameters
  switch (command.accepted.kind) {
    case 'place_order':
      return scopeFromIntent(parameters.position_intent)
    case 'place_execution_group': {
      const scopes = new Set<string>()
      for (const child of arrayValue(parameters.children)) {
        for (const scope of scopeFromIntent(objectValue(child)?.position_intent)) scopes.add(scope)
      }
      return scopes
    }
    case 'place_chase':
      return scopeFromIntent(objectValue(parameters.plan)?.position_intent)
    case 'place_trailing_entry': {
      const execution = objectValue(objectValue(parameters.plan)?.execution)
      const scope = stringValue(execution?.exposure_scope_id)
      return scope === null ? new Set() : new Set([scope])
    }
    default:
      return new Set()
  }
}

function scopeFromIntent(value: unknown): Set<string> {
  const intent = objectValue(value)
  const scope = intent?.kind === 'open' ? stringValue(intent.scope_id) : null
  return scope === null ? new Set() : new Set([scope])
}
