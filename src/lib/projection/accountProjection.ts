import type {
  AccountRouteKey,
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  ClientCommandPage,
  CommandHistoryCursor,
  ProjectionGraph,
  Uuid,
} from '../gateway/index.ts'
import {
  expandDescendants,
  graphNodes,
  isTerminalCommand,
  mergeGraph,
  nodeKey,
  pruneLiveSnapshot,
  relationshipKey,
  upsertSnapshotGraph,
  validateExecutionReferences,
} from './graph.ts'

export type ProjectionStateErrorCode =
  | 'invalid_revision'
  | 'shard_mismatch'
  | 'schema_mismatch'
  | 'revision_gap'
  | 'history_revision_mismatch'
  | 'invalid_history_page'

export class ProjectionStateError extends Error {
  readonly code: ProjectionStateErrorCode

  constructor(code: ProjectionStateErrorCode, message: string) {
    super(message)
    this.name = 'ProjectionStateError'
    this.code = code
  }
}

export interface HistoricalCommandProjection extends ProjectionGraph {
  root_command_ids: Uuid[]
  next_cursor: CommandHistoryCursor | null
}

export interface AccountProjectionView {
  live: BrowserAccountSnapshot
  history: HistoricalCommandProjection | null
}

export function installSnapshot(snapshot: BrowserAccountSnapshot): AccountProjectionView {
  validateRevision(snapshot.checkpoint.projection_revision)
  return { live: cloneSnapshot(snapshot), history: null }
}

export function applyDelta(
  view: AccountProjectionView,
  delta: BrowserAccountDelta,
): AccountProjectionView {
  requireSameRoute(view.live.checkpoint.shard, delta.checkpoint.shard)
  requireSameSchema(view.live.checkpoint.schema_version, delta.checkpoint.schema_version)
  const current = view.live.checkpoint.projection_revision
  const actual = delta.checkpoint.projection_revision
  validateRevision(current)
  validateRevision(actual)

  const expected = current + 1
  if (!Number.isSafeInteger(expected) || actual !== expected) {
    throw new ProjectionStateError(
      'revision_gap',
      `projection revision gap: expected ${expected}, received ${actual}`,
    )
  }

  const graph = upsertSnapshotGraph(view.live, delta)
  const live = pruneLiveSnapshot({
    ...graph,
    checkpoint: delta.checkpoint,
    positions: mergeRows(view.live.positions, delta.positions, (row) => row.symbol),
    balances: mergeRows(view.live.balances, delta.balances, (row) => row.asset),
    protections: mergeRows(view.live.protections, delta.protections, (row) => row.remote_order_id),
  })

  return { live, history: null }
}

export function mergeHistoryPage(
  view: AccountProjectionView,
  page: ClientCommandPage,
): AccountProjectionView {
  requireSameRoute(view.live.checkpoint.shard, page.checkpoint.shard)
  requireSameSchema(view.live.checkpoint.schema_version, page.checkpoint.schema_version)
  validateRevision(page.checkpoint.projection_revision)
  const expected = view.live.checkpoint.projection_revision
  const actual = page.checkpoint.projection_revision
  if (actual !== expected) {
    throw new ProjectionStateError(
      'history_revision_mismatch',
      `history page revision changed: expected ${expected}, received ${actual}`,
    )
  }
  validateHistoryPage(page)

  const incoming = graphFromPage(page)
  const prior = view.history
  const history = prior === null ? incoming : mergeHistory(prior, incoming)
  return { live: view.live, history }
}

export function combinedProjection(view: AccountProjectionView): ProjectionGraph {
  return view.history === null ? graphFromSnapshot(view.live) : mergeGraph(view.live, view.history)
}

function validateHistoryPage(page: ClientCommandPage): void {
  const graph = graphFromPage(page)
  const nodes = graphNodes(graph)
  const commandById = new Map(page.commands.map((command) => [command.command_id, command]))
  const rootIds = new Set(page.root_command_ids)

  if (rootIds.size !== page.root_command_ids.length || commandById.size !== page.commands.length) {
    invalidHistory('history page has duplicate command identities')
  }
  for (const commandId of rootIds) {
    const command = commandById.get(commandId)
    if (command === undefined || !isTerminalCommand(command.lifecycle)) {
      invalidHistory(`history root ${commandId} is missing or nonterminal`)
    }
  }
  for (const edge of page.relationships) {
    if (!nodes.has(nodeKey(edge.parent)) || !nodes.has(nodeKey(edge.child))) {
      invalidHistory(`history relationship ${relationshipKey(edge)} references a missing node`)
    }
  }
  const reachable = expandDescendants(page.relationships, page.root_command_ids)
  if (!equalSets(nodes, reachable)) {
    invalidHistory('history page contains graph nodes outside its terminal roots')
  }
  if (!validateExecutionReferences(page.executions, nodes)) {
    invalidHistory('history page execution references a missing order')
  }
}

function mergeHistory(
  existing: HistoricalCommandProjection,
  incoming: HistoricalCommandProjection,
): HistoricalCommandProjection {
  const merged = mergeGraph(incoming, existing)
  return {
    ...merged,
    root_command_ids: unique([...existing.root_command_ids, ...incoming.root_command_ids]),
    next_cursor: incoming.next_cursor,
  }
}

function graphFromSnapshot(snapshot: BrowserAccountSnapshot): ProjectionGraph {
  return {
    commands: snapshot.commands,
    execution_groups: snapshot.execution_groups,
    chases: snapshot.chases,
    trailing_entries: snapshot.trailing_entries,
    close_workflows: snapshot.close_workflows,
    flatten_workflows: snapshot.flatten_workflows,
    orders: snapshot.orders,
    executions: snapshot.executions,
    relationships: snapshot.relationships,
  }
}

function graphFromPage(page: ClientCommandPage): HistoricalCommandProjection {
  return {
    commands: page.commands,
    execution_groups: page.execution_groups,
    chases: page.chases,
    trailing_entries: page.trailing_entries,
    close_workflows: page.close_workflows,
    flatten_workflows: page.flatten_workflows,
    orders: page.orders,
    executions: page.executions,
    relationships: page.relationships,
    root_command_ids: page.root_command_ids,
    next_cursor: page.next_cursor,
  }
}

function cloneSnapshot(snapshot: BrowserAccountSnapshot): BrowserAccountSnapshot {
  return {
    ...snapshot,
    window: { ...snapshot.window },
    commands: [...snapshot.commands],
    execution_groups: [...snapshot.execution_groups],
    chases: [...snapshot.chases],
    trailing_entries: [...snapshot.trailing_entries],
    close_workflows: [...snapshot.close_workflows],
    flatten_workflows: [...snapshot.flatten_workflows],
    orders: [...snapshot.orders],
    positions: [...snapshot.positions],
    executions: [...snapshot.executions],
    balances: [...snapshot.balances],
    protections: [...snapshot.protections],
    relationships: [...snapshot.relationships],
  }
}

function requireSameRoute(expected: AccountRouteKey, actual: AccountRouteKey): void {
  if (
    expected.exchange !== actual.exchange ||
    expected.network !== actual.network ||
    expected.account_id !== actual.account_id
  ) {
    throw new ProjectionStateError('shard_mismatch', 'projection belongs to a different shard')
  }
}

function requireSameSchema(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new ProjectionStateError(
      'schema_mismatch',
      `projection schema mismatch: expected ${expected}, received ${actual}`,
    )
  }
}

function validateRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new ProjectionStateError(
      'invalid_revision',
      `projection revision ${revision} is not a safe nonnegative integer`,
    )
  }
}

function invalidHistory(message: string): never {
  throw new ProjectionStateError('invalid_history_page', message)
}

function equalSets(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && Array.from(left).every((value) => right.has(value))
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function mergeRows<T>(existing: T[], incoming: T[], identity: (row: T) => string): T[] {
  const rows = new Map(existing.map((row) => [identity(row), row]))
  for (const row of incoming) {
    rows.set(identity(row), row)
  }
  return Array.from(rows.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row)
}
