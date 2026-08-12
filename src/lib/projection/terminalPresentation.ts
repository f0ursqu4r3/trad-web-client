import type {
  BrowserAccountSnapshot,
  NativeProtectionProjection,
  ProjectionGraph,
  ProjectionNodeId,
} from '../gateway/index.ts'
import {
  commandProtectionScopeId,
  commandTree,
  entityLabel,
  entityStatus,
  type ProjectionEntity,
  type ProjectionTreeNode,
} from './presentation.ts'

export interface TerminalBadge {
  label: string
  tone: 'dim' | 'info' | 'success' | 'warning' | 'error'
}

export type TerminalTreeEntity =
  | { kind: 'projection'; node: ProjectionNodeId; entity: ProjectionEntity }
  | { kind: 'native_protection'; id: string; protection: NativeProtectionProjection }

export interface TerminalTreeNode {
  key: string
  label: string
  status: string
  tone: TerminalBadge['tone']
  relationship: string | null
  badges: TerminalBadge[]
  entity: TerminalTreeEntity
  children: TerminalTreeNode[]
}

export function terminalCommandTree(
  graph: ProjectionGraph,
  snapshot: BrowserAccountSnapshot,
  commandId: string,
): TerminalTreeNode | null {
  const tree = commandTree(graph, commandId)
  if (tree === null) return null
  const command = graph.commands.find((row) => row.command_id === commandId) ?? null
  const scopeId = command === null ? null : commandProtectionScopeId(command)
  const protections =
    scopeId === null
      ? []
      : snapshot.native_protections.filter((protection) => protection.scope_id === scopeId)
  return convertTree(tree, protections, true)
}

function convertTree(
  tree: ProjectionTreeNode,
  protections: NativeProtectionProjection[],
  isRoot: boolean,
): TerminalTreeNode {
  const entity = tree.entity
  const children = tree.children.map((child) => convertTree(child, [], false))
  if (isRoot) children.push(...protections.map(protectionNode))
  const status = entityStatus(entity)
  return {
    key: `${entity.kind}:${entity.id}`,
    label: entityLabel(entity),
    status,
    tone: lifecycleTone(status),
    relationship: tree.relationship,
    badges: entityBadges(entity),
    entity: {
      kind: 'projection',
      node: { kind: entity.kind, id: entity.id },
      entity,
    },
    children,
  }
}

function protectionNode(protection: NativeProtectionProjection): TerminalTreeNode {
  return {
    key: `native_protection:${protection.protection_id}`,
    label: 'Native Protection',
    status: protection.status,
    tone: lifecycleTone(protection.status),
    relationship: 'attached protection',
    badges: [
      badge(protection.position_side, sideTone(protection.position_side)),
      badge(protection.symbol, 'dim'),
      badge(`${protection.covered_quantity} / ${protection.target_quantity}`, 'dim'),
    ],
    entity: {
      kind: 'native_protection',
      id: protection.protection_id,
      protection,
    },
    children: [],
  }
}

function entityBadges(entity: ProjectionEntity): TerminalBadge[] {
  switch (entity.kind) {
    case 'order':
      return compactBadges([
        badge(entity.row.current_request.position_side, sideTone(entity.row.current_request.position_side)),
        badge(entity.row.current_request.side, 'dim'),
        badge(entity.row.current_request.symbol, 'dim'),
        entity.row.current_request.reduce_only ? badge('Reduce only', 'warning') : null,
        entity.row.reconciliation_required ? badge('Reconcile', 'error') : null,
      ])
    case 'execution_group':
      return compactBadges([
        badge(entity.row.purpose, 'dim'),
        badge(`${entity.row.filled_children}/${entity.row.child_order_ids.length} filled`, 'dim'),
        entity.row.reconciliation_children > 0 ? badge('Reconcile', 'error') : null,
      ])
    case 'chase':
      return compactBadges([
        badge('Post only', 'info'),
        entity.row.market_stale ? badge('Market stale', 'warning') : null,
        badge(`r${entity.row.reprice_sequence}`, 'dim'),
      ])
    case 'trailing_entry':
      return compactBadges([
        badge(entity.row.plan.position_side, sideTone(entity.row.plan.position_side)),
        badge(entity.row.plan.symbol, 'dim'),
        badge(entity.row.phase, lifecycleTone(entity.row.phase)),
      ])
    case 'close_workflow':
      return compactBadges([
        badge(entity.row.position_side, sideTone(entity.row.position_side)),
        badge(entity.row.symbol, 'dim'),
        badge(entity.row.execution.kind, 'dim'),
      ])
    case 'flatten_workflow':
      return [badge(`${entity.row.affected_command_ids.length} affected`, 'dim')]
    case 'command':
      return []
    case 'entry_cancellation':
      return [badge(`${entity.row.affected_command_ids.length} affected`, 'dim')]
    case 'account_control':
      return [badge(entity.row.request.kind, 'dim')]
    case 'protection_amendment':
      return [badge(`${entity.row.completed_steps}/${entity.row.steps.length} steps`, 'dim')]
  }
}

function compactBadges(values: Array<TerminalBadge | null>): TerminalBadge[] {
  return values.filter((value): value is TerminalBadge => value !== null)
}

function badge(label: string, tone: TerminalBadge['tone']): TerminalBadge {
  return { label: title(label), tone }
}

function sideTone(side: string): TerminalBadge['tone'] {
  return side.toLowerCase() === 'long' ? 'success' : side.toLowerCase() === 'short' ? 'error' : 'dim'
}

export function lifecycleTone(status: string): TerminalBadge['tone'] {
  const value = status.toLowerCase()
  if (['succeeded', 'filled', 'completed', 'flat'].includes(value)) return 'success'
  if (value.includes('fail') || value.includes('reject') || value.includes('reconciliation')) {
    return 'error'
  }
  if (value.includes('cancel') || value.includes('stale') || value.includes('paused')) {
    return 'warning'
  }
  if (['running', 'working', 'tracking', 'triggered', 'installing', 'resizing'].includes(value)) {
    return 'info'
  }
  return 'dim'
}

function title(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}
