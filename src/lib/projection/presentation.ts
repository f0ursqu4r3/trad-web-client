import type {
  AccountControlProjection,
  ChaseProjection,
  CloseWorkflowProjection,
  CommandProjection,
  ExecutionGroupProjection,
  EntryCancellationProjection,
  FlattenWorkflowProjection,
  OrderProjection,
  ProjectionGraph,
  ProjectionNodeId,
  TrailingEntryProjection,
} from '../gateway/index.ts'
import { nodeKey } from './graph.ts'

export type ProjectionEntity =
  | { kind: 'command'; id: string; row: CommandProjection }
  | { kind: 'order'; id: string; row: OrderProjection }
  | {
      kind: 'execution_group'
      id: string
      row: ExecutionGroupProjection
    }
  | { kind: 'chase'; id: string; row: ChaseProjection }
  | {
      kind: 'trailing_entry'
      id: string
      row: TrailingEntryProjection
    }
  | {
      kind: 'close_workflow'
      id: string
      row: CloseWorkflowProjection
    }
  | {
      kind: 'flatten_workflow'
      id: string
      row: FlattenWorkflowProjection
    }
  | {
      kind: 'entry_cancellation'
      id: string
      row: EntryCancellationProjection
    }
  | {
      kind: 'account_control'
      id: string
      row: AccountControlProjection
    }

export interface ProjectionTreeNode {
  entity: ProjectionEntity
  relationship: string | null
  children: ProjectionTreeNode[]
}

export function projectionEntities(graph: ProjectionGraph): Map<string, ProjectionEntity> {
  const entities = new Map<string, ProjectionEntity>()
  for (const row of graph.commands) put(entities, { kind: 'command', id: row.command_id, row })
  for (const row of graph.orders) put(entities, { kind: 'order', id: row.order_id, row })
  for (const row of graph.execution_groups) {
    put(entities, { kind: 'execution_group', id: row.group_id, row })
  }
  for (const row of graph.chases) put(entities, { kind: 'chase', id: row.chase_id, row })
  for (const row of graph.trailing_entries) {
    put(entities, { kind: 'trailing_entry', id: row.trailing_entry_id, row })
  }
  for (const row of graph.close_workflows) {
    put(entities, { kind: 'close_workflow', id: row.close_workflow_id, row })
  }
  for (const row of graph.flatten_workflows) {
    put(entities, { kind: 'flatten_workflow', id: row.flatten_workflow_id, row })
  }
  for (const row of graph.entry_cancellations) {
    put(entities, { kind: 'entry_cancellation', id: row.cancellation_id, row })
  }
  for (const row of graph.account_controls) {
    put(entities, { kind: 'account_control', id: row.control_id, row })
  }
  return entities
}

export function commandTree(graph: ProjectionGraph, commandId: string): ProjectionTreeNode | null {
  const entities = projectionEntities(graph)
  const rootKey = nodeKey({ kind: 'command', id: commandId })
  return buildTree(graph, entities, rootKey, null, new Set())
}

export function entityStatus(entity: ProjectionEntity): string {
  switch (entity.kind) {
    case 'command':
    case 'order':
    case 'execution_group':
    case 'chase':
    case 'trailing_entry':
    case 'close_workflow':
    case 'flatten_workflow':
    case 'entry_cancellation':
    case 'account_control':
      return entity.row.lifecycle
  }
}

export function entityLabel(entity: ProjectionEntity): string {
  switch (entity.kind) {
    case 'command':
      return commandLabel(entity.row)
    case 'order':
      return orderLabel(entity.row)
    case 'execution_group':
      return `${title(entity.row.purpose)} Execution`
    case 'chase':
      return 'Chase'
    case 'trailing_entry':
      return 'Trailing Entry'
    case 'close_workflow':
      return entity.row.close_all ? 'Close Exposure' : 'Partial Close'
    case 'flatten_workflow':
      return 'Flatten'
    case 'entry_cancellation':
      return 'Cancel Entry Work'
    case 'account_control':
      return entity.row.request.kind === 'set_leverage' ? 'Set Leverage' : 'Set Position Mode'
  }
}

export function commandLabel(command: CommandProjection): string {
  if (command.accepted.kind === 'place_order') {
    const request = objectValue(command.accepted.parameters.request)
    const execution = objectValue(request?.execution)
    const executionKind = execution?.kind
    if (typeof executionKind === 'string') return `${title(executionKind)} Order`
  }
  return commandKindLabel(command.accepted.kind)
}

export function commandKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    place_order: 'Order',
    place_execution_group: 'Split Order',
    place_chase: 'Chase Order',
    place_trailing_entry: 'Trailing Entry',
    amend_trailing_entry: 'Edit Trailing Entry',
    activate_trailing_entry: 'Activate Trailing Entry',
    enter_trailing_entry: 'Enter Trailing Entry',
    continue_trailing_entry: 'Continue Trailing Entry',
    close_trailing_entry: 'Close Trailing Entry',
    close_exposure: 'Close Exposure',
    flatten: 'Flatten',
    cancel_entry_work: 'Cancel Entry Work',
    modify_order: 'Modify Order',
    replace_order: 'Replace Order',
    cancel_order: 'Cancel Order',
    cancel_chase: 'Cancel Chase',
    cancel_trailing_entry: 'Cancel Trailing Entry',
    configure_account: 'Account Configuration',
  }
  return labels[kind] ?? title(kind)
}

export function commandSymbol(command: CommandProjection, graph: ProjectionGraph): string | null {
  const tree = commandTree(graph, command.command_id)
  if (tree === null) return null
  return findSymbol(tree)
}

export function commandSymbolIndex(graph: ProjectionGraph): Map<string, string | null> {
  const entities = projectionEntities(graph)
  const children = new Map<string, string[]>()
  for (const edge of graph.relationships) {
    const parent = nodeKey(edge.parent)
    const rows = children.get(parent) ?? []
    rows.push(nodeKey(edge.child))
    children.set(parent, rows)
  }

  const symbols = new Map<string, string | null>()
  const visiting = new Set<string>()
  const resolve = (key: string): string | null => {
    if (symbols.has(key)) return symbols.get(key) ?? null
    if (visiting.has(key)) return null
    visiting.add(key)

    const entity = entities.get(key)
    let symbol = entity === undefined ? null : directSymbol(entity)
    if (symbol === null) {
      for (const child of children.get(key) ?? []) {
        symbol = resolve(child)
        if (symbol !== null) break
      }
    }
    visiting.delete(key)
    symbols.set(key, symbol)
    return symbol
  }

  return new Map(
    graph.commands.map((command) => [
      command.command_id,
      resolve(nodeKey({ kind: 'command', id: command.command_id })),
    ]),
  )
}

function findSymbol(tree: ProjectionTreeNode): string | null {
  const entity = tree.entity
  const direct = directSymbol(entity)
  if (direct !== null) return direct
  for (const child of tree.children) {
    const symbol = findSymbol(child)
    if (symbol !== null) return symbol
  }
  return null
}

function directSymbol(entity: ProjectionEntity): string | null {
  switch (entity.kind) {
    case 'order':
      return entity.row.current_request.symbol
    case 'close_workflow':
      return entity.row.symbol
    case 'trailing_entry':
    case 'chase': {
      const symbol = entity.row.plan.symbol
      return typeof symbol === 'string' ? symbol : null
    }
    case 'account_control':
      return entity.row.request.kind === 'set_leverage' ? entity.row.request.symbol : null
    default:
      return null
  }
}

function buildTree(
  graph: ProjectionGraph,
  entities: Map<string, ProjectionEntity>,
  key: string,
  relationship: string | null,
  ancestors: Set<string>,
): ProjectionTreeNode | null {
  const entity = entities.get(key)
  if (entity === undefined || ancestors.has(key)) return null
  const nextAncestors = new Set(ancestors)
  nextAncestors.add(key)
  const children = graph.relationships
    .filter((edge) => nodeKey(edge.parent) === key)
    .map((edge) =>
      buildTree(graph, entities, nodeKey(edge.child), edge.relationship, nextAncestors),
    )
    .filter((child): child is ProjectionTreeNode => child !== null)
  return { entity, relationship, children }
}

function orderLabel(order: OrderProjection): string {
  const execution = order.current_request.execution
  const kind = typeof execution.kind === 'string' ? execution.kind : 'order'
  return `${title(kind)} Order`
}

function put(entities: Map<string, ProjectionEntity>, entity: ProjectionEntity): void {
  entities.set(nodeKey({ kind: entity.kind, id: entity.id }), entity)
}

function title(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
