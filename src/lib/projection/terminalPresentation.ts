import type {
  BrowserAccountSnapshot,
  NativeProtectionProjection,
  ProjectionGraph,
  ProjectionNodeId,
} from '../gateway/index.ts'
import { isExactZero } from '../exactDecimalMath.ts'
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
  | {
      kind: 'protection_child'
      protectionId: string
      childId: string
      protection: NativeProtectionProjection
    }
  | {
      kind: 'order_generation'
      orderId: string
      generation: number
      entity: Extract<ProjectionEntity, { kind: 'order' }>
    }

export interface TerminalTreeNode {
  id: string
  key: string
  kind: string
  label: string
  status: string
  tone: TerminalBadge['tone']
  relationship: string | null
  badges: TerminalBadge[]
  entity: TerminalTreeEntity
  children: TerminalTreeNode[]
  intent?: string | null
  throttled?: boolean
  protection?: { text: string; className: string } | null
  symbol?: string | null
  market?: {
    exchange?: string | null
    product?: string | null
    account?: string | null
    network?: string | null
  } | null
  lifecycle?: string | null
}

export function terminalCommandTree(
  graph: ProjectionGraph,
  snapshot: BrowserAccountSnapshot,
  commandId: string,
): TerminalTreeNode | null {
  const command = graph.commands.find((row) => row.command_id === commandId) ?? null
  if (command === null) return null
  const commandRoot = commandTree(graph, commandId)
  if (commandRoot === null) return null
  const tree =
    commandRoot.children.find(
      (child) => child.entity.kind === command.root.kind && child.entity.id === command.root.id,
    ) ?? commandRoot
  const scopeId = command === null ? null : commandProtectionScopeId(command)
  const protections =
    scopeId === null
      ? []
      : snapshot.native_protections.filter((protection) => protection.scope_id === scopeId)
  const root = convertTree(tree)
  attachProtection(root, protections)
  return root
}

function convertTree(tree: ProjectionTreeNode): TerminalTreeNode {
  const entity = tree.entity
  const children = tree.children.map(convertTree)
  if (entity.kind === 'order' && Object.keys(entity.row.generations).length > 1) {
    children.push(
      ...Object.values(entity.row.generations)
        .sort((left, right) => left.generation - right.generation)
        .map((generation) => generationNode(entity, generation.generation)),
    )
  }
  const status = entityStatus(entity)
  const key = `${entity.kind}:${entity.id}`
  return {
    id: key,
    key,
    kind: entity.kind,
    label: terminalEntityLabel(entity),
    status: terminalStatus(status),
    tone: lifecycleTone(status),
    relationship: tree.relationship,
    badges: entityBadges(entity),
    entity: {
      kind: 'projection',
      node: { kind: entity.kind, id: entity.id },
      entity,
    },
    children,
    intent: entityIntent(entity),
    throttled: false,
    protection: null,
    symbol: entitySymbol(entity),
    market: null,
    lifecycle:
      entity.kind === 'trailing_entry' && !isTerminalStatus(status) ? entity.row.phase : null,
  }
}

function protectionNode(protection: NativeProtectionProjection): TerminalTreeNode {
  const key = `native_protection:${protection.protection_id}`
  return {
    id: key,
    key,
    kind: 'native_protection',
    label: 'Native Protection',
    status: terminalStatus(protection.status),
    tone: lifecycleTone(protection.status),
    relationship: 'attached protection',
    badges: [badge(`${protection.covered_quantity} / ${protection.target_quantity}`, 'info')],
    entity: {
      kind: 'native_protection',
      id: protection.protection_id,
      protection,
    },
    children: protection.plan.children.map((child) =>
      protectionChildNode(protection, child.child_id),
    ),
    intent: null,
    throttled: false,
    protection: {
      text: `Native Protection: ${title(protection.status)}`,
      className: protectionStatusClass(protection.status),
    },
    symbol: protection.symbol,
    market: null,
    lifecycle: null,
  }
}

function protectionChildNode(
  protection: NativeProtectionProjection,
  childId: string,
): TerminalTreeNode {
  const plan = protection.plan.children.find((child) => child.child_id === childId)!
  const state = protection.children[childId]
  const status = protectionChildStatus(protection, state)
  const key = `protection_child:${protection.protection_id}:${childId}`
  return {
    id: key,
    key,
    kind: 'protection_child',
    label: title(plan.protection_kind),
    status,
    tone: lifecycleTone(status),
    relationship: 'protection child',
    badges: [
      badge(plan.trigger_source, 'dim'),
      badge(plan.execution.kind, 'dim'),
      badge(plan.trigger_price, 'dim'),
    ],
    entity: {
      kind: 'protection_child',
      protectionId: protection.protection_id,
      childId,
      protection,
    },
    children: [],
    intent: null,
    throttled: false,
    protection: null,
    symbol: null,
    market: null,
    lifecycle: null,
  }
}

function protectionChildStatus(
  protection: NativeProtectionProjection,
  state: NativeProtectionProjection['children'][string] | undefined,
): string {
  if (state?.failure_reason) return 'Failed'
  if (state?.pending_operation_id) return 'Waiting'
  if (state === undefined)
    return isTerminalStatus(protection.status) ? terminalStatus(protection.status) : 'Waiting'

  if (protection.status === 'flat') {
    return isExactZero(state.cumulative_filled_quantity) ? 'Canceled' : 'Completed'
  }
  if (isTerminalStatus(protection.status)) return terminalStatus(protection.status)
  return 'Running'
}

function generationNode(
  entity: Extract<ProjectionEntity, { kind: 'order' }>,
  generation: number,
): TerminalTreeNode {
  const row = entity.row.generations[String(generation)]
  const key = `order_generation:${entity.id}:${generation}`
  return {
    id: key,
    key,
    kind: 'order_generation',
    label: `Order Generation ${generation}`,
    status: terminalStatus(row?.lifecycle ?? 'unknown'),
    tone: lifecycleTone(row?.lifecycle ?? 'unknown'),
    relationship: 'order generation',
    badges: row
      ? [
          badge(`${row.filled_quantity} filled`, 'dim'),
          badge(executionKind(row.working_request.execution), 'dim'),
        ]
      : [],
    entity: { kind: 'order_generation', orderId: entity.id, generation, entity },
    children: [],
    intent: null,
    throttled: false,
    protection: null,
    symbol: null,
    market: null,
    lifecycle: null,
  }
}

function attachProtection(root: TerminalTreeNode, protections: NativeProtectionProjection[]): void {
  if (protections.length === 0) return
  const group = findFirst(
    root,
    (node) => node.entity.kind === 'projection' && node.entity.entity.kind === 'execution_group',
  )
  const order = findFirst(
    root,
    (node) => node.entity.kind === 'projection' && node.entity.entity.kind === 'order',
  )
  const parent = group ?? order ?? root
  parent.children.push(...protections.map(protectionNode))
}

function findFirst(
  node: TerminalTreeNode,
  predicate: (candidate: TerminalTreeNode) => boolean,
): TerminalTreeNode | null {
  if (predicate(node)) return node
  for (const child of node.children) {
    const found = findFirst(child, predicate)
    if (found !== null) return found
  }
  return null
}

function terminalEntityLabel(entity: ProjectionEntity): string {
  if (entity.kind === 'execution_group') return 'Split'
  return entityLabel(entity)
}

function entityIntent(entity: ProjectionEntity): string | null {
  if (entity.kind === 'order') return entity.row.current_request.reduce_only ? 'Close' : 'Open'
  if (entity.kind === 'execution_group') return title(entity.row.purpose)
  if (entity.kind === 'close_workflow') return 'Close'
  return null
}

function entitySymbol(entity: ProjectionEntity): string | null {
  if (entity.kind === 'order') return entity.row.current_request.symbol
  if (entity.kind === 'trailing_entry') return entity.row.plan.symbol
  if (entity.kind === 'close_workflow') return entity.row.symbol
  return null
}

function executionKind(value: Record<string, unknown>): string {
  return typeof value.kind === 'string' ? value.kind : 'order'
}

function terminalStatus(status: string): string {
  const value = status.toLowerCase()
  if (value.includes('fail') || value.includes('reject') || value.includes('reconciliation'))
    return 'Failed'
  if (value.includes('cancel')) return 'Canceled'
  if (['succeeded', 'filled', 'completed', 'flat'].includes(value)) return 'Completed'
  if (value.includes('wait') || value.includes('pending') || value.includes('install'))
    return 'Waiting'
  return 'Running'
}

function isTerminalStatus(status: string): boolean {
  return ['succeeded', 'filled', 'completed', 'flat', 'failed', 'canceled', 'rejected'].includes(
    status.toLowerCase(),
  )
}

function entityBadges(entity: ProjectionEntity): TerminalBadge[] {
  switch (entity.kind) {
    case 'order':
      return compactBadges([
        entity.row.current_request.reduce_only ? badge('Reduce only', 'warning') : null,
        entity.row.reconciliation_required ? badge('Reconcile', 'error') : null,
      ])
    case 'execution_group':
      return compactBadges([
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
      return []
    case 'close_workflow':
      return [badge(entity.row.execution.kind, 'dim')]
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

function protectionStatusClass(status: string): string {
  const tone = lifecycleTone(status)
  if (tone === 'error') return 'pill-err'
  if (tone === 'warning') return 'pill-warn'
  if (tone === 'success' || tone === 'info') return 'pill-info'
  return ''
}

function title(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`)
    .join(' ')
}
