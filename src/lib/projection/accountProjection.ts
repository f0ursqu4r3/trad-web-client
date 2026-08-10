import type {
  AccountRouteKey,
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  ClientCommandPage,
  CommandHistoryCursor,
  LegacyCommandPage,
  LegacyCommandEvidence,
  LegacyDeviceEvidence,
  LegacyHistoryCursor,
  LegacyRelationshipEvidence,
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
  | 'invalid_legacy_history_page'

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

export interface HistoricalLegacyProjection {
  run_id: Uuid
  source_fingerprint: string
  root_command_ids: Uuid[]
  commands: LegacyCommandEvidence[]
  devices: LegacyDeviceEvidence[]
  relationships: LegacyRelationshipEvidence[]
  unresolved_active_entities: Uuid[]
  next_cursor: LegacyHistoryCursor | null
}

export interface AccountProjectionView {
  live: BrowserAccountSnapshot
  history: HistoricalCommandProjection | null
  legacyHistory: HistoricalLegacyProjection | null
}

export function installSnapshot(snapshot: BrowserAccountSnapshot): AccountProjectionView {
  validateRevision(snapshot.checkpoint.projection_revision)
  return { live: cloneSnapshot(snapshot), history: null, legacyHistory: null }
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

  const merged = {
    ...upsertSnapshotGraph(view.live, delta),
    checkpoint: delta.checkpoint,
    positions: mergeRows(view.live.positions, delta.positions, (row) => row.symbol),
    balances: mergeRows(view.live.balances, delta.balances, (row) => row.asset),
    protections: mergeRows(view.live.protections, delta.protections, (row) => row.remote_order_id),
  }
  const topologyChanged = delta.commands.length > 0 || delta.relationships.length > 0
  const live = topologyChanged || exceedsTerminalWindow(merged) ? pruneLiveSnapshot(merged) : merged

  return { live, history: null, legacyHistory: view.legacyHistory }
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
  return { live: view.live, history, legacyHistory: view.legacyHistory }
}

export function mergeLegacyHistoryPage(
  view: AccountProjectionView,
  page: LegacyCommandPage,
): AccountProjectionView {
  validateLegacyHistoryPage(page)
  const migration = view.live.checkpoint.legacy_migration
  if (
    migration === undefined ||
    migration.run_id !== page.run_id ||
    migration.source_fingerprint !== page.source_fingerprint
  ) {
    invalidLegacyHistory('legacy history does not match the account migration checkpoint')
  }

  const prior = view.legacyHistory
  if (
    prior !== null &&
    (prior.run_id !== page.run_id || prior.source_fingerprint !== page.source_fingerprint)
  ) {
    invalidLegacyHistory('legacy history source changed between pages')
  }
  const legacyHistory = prior === null ? cloneLegacyPage(page) : mergeLegacyHistory(prior, page)
  return { live: view.live, history: view.history, legacyHistory }
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

function validateLegacyHistoryPage(page: LegacyCommandPage): void {
  if (!sha256(page.source_fingerprint) || page.run_id.length === 0) {
    invalidLegacyHistory('legacy history source identity is invalid')
  }
  const commands = new Map(page.commands.map((command) => [command.command_id, command]))
  const devices = new Map(page.devices.map((device) => [device.device_id, device]))
  const roots = new Set(page.root_command_ids)
  if (commands.size !== page.commands.length || roots.size !== page.root_command_ids.length) {
    invalidLegacyHistory('legacy history has duplicate command identities')
  }
  if (devices.size !== page.devices.length) {
    invalidLegacyHistory('legacy history has duplicate device identities')
  }
  for (const root of roots) {
    if (!commands.has(root)) invalidLegacyHistory(`legacy history root ${root} is missing`)
  }
  for (const command of page.commands) {
    if (!sha256(command.payload_sha256)) {
      invalidLegacyHistory(`legacy command ${command.command_id} has an invalid digest`)
    }
  }
  for (const device of page.devices) {
    if (!sha256(device.device_payload_sha256) || !sha256(device.state_payload_sha256)) {
      invalidLegacyHistory(`legacy device ${device.device_id} has an invalid digest`)
    }
  }

  const reachable = new Set<Uuid>()
  let changed = true
  while (changed) {
    changed = false
    for (const edge of page.relationships) {
      const parentReachable =
        (edge.parent_kind === 'command' && roots.has(edge.parent_id)) ||
        (edge.parent_kind !== 'command' && reachable.has(edge.parent_id))
      if (parentReachable && devices.has(edge.child_id) && !reachable.has(edge.child_id)) {
        reachable.add(edge.child_id)
        changed = true
      }
    }
  }
  if (reachable.size !== devices.size) {
    invalidLegacyHistory('legacy history contains devices outside its command roots')
  }
  for (const edge of page.relationships) {
    const parentPresent =
      (edge.parent_kind === 'command' && roots.has(edge.parent_id)) ||
      (edge.parent_kind !== 'command' && devices.has(edge.parent_id))
    if (!parentPresent || !devices.has(edge.child_id)) {
      invalidLegacyHistory('legacy history relationship references a missing endpoint')
    }
  }
  if (page.unresolved_active_entities.some((id) => !devices.has(id))) {
    invalidLegacyHistory('legacy unresolved identity is outside the page')
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

function mergeLegacyHistory(
  existing: HistoricalLegacyProjection,
  incoming: LegacyCommandPage,
): HistoricalLegacyProjection {
  requireNoLegacyOverlap(existing.commands, incoming.commands, 'command_id')
  requireNoLegacyOverlap(existing.devices, incoming.devices, 'device_id')
  return {
    run_id: existing.run_id,
    source_fingerprint: existing.source_fingerprint,
    root_command_ids: [...existing.root_command_ids, ...incoming.root_command_ids],
    commands: [...existing.commands, ...incoming.commands],
    devices: [...existing.devices, ...incoming.devices],
    relationships: uniqueBy(
      [...existing.relationships, ...incoming.relationships],
      legacyRelationshipKey,
    ),
    unresolved_active_entities: unique([
      ...existing.unresolved_active_entities,
      ...incoming.unresolved_active_entities,
    ]),
    next_cursor: incoming.next_cursor,
  }
}

function cloneLegacyPage(page: LegacyCommandPage): HistoricalLegacyProjection {
  return {
    ...page,
    root_command_ids: [...page.root_command_ids],
    commands: [...page.commands],
    devices: [...page.devices],
    relationships: [...page.relationships],
    unresolved_active_entities: [...page.unresolved_active_entities],
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
    entry_cancellations: snapshot.entry_cancellations,
    account_controls: snapshot.account_controls,
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
    entry_cancellations: page.entry_cancellations,
    account_controls: page.account_controls,
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
    entry_cancellations: [...snapshot.entry_cancellations],
    account_controls: [...snapshot.account_controls],
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

function invalidLegacyHistory(message: string): never {
  throw new ProjectionStateError('invalid_legacy_history_page', message)
}

function sha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}

function requireNoLegacyOverlap<T>(existing: T[], incoming: T[], key: keyof T): void {
  const identities = new Set(existing.map((row) => String(row[key])))
  if (incoming.some((row) => identities.has(String(row[key])))) {
    invalidLegacyHistory('legacy history pages overlap')
  }
}

function legacyRelationshipKey(edge: LegacyRelationshipEvidence): string {
  return [
    edge.parent_kind,
    edge.parent_id,
    edge.child_kind,
    edge.child_id,
    edge.relationship_kind,
  ].join(':')
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  return Array.from(new Map(values.map((value) => [key(value), value])).values())
}

function equalSets(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && Array.from(left).every((value) => right.has(value))
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function mergeRows<T>(existing: T[], incoming: T[], identity: (row: T) => string): T[] {
  if (incoming.length === 0) return existing
  const rows = new Map(existing.map((row) => [identity(row), row]))
  for (const row of incoming) {
    rows.set(identity(row), row)
  }
  return Array.from(rows.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row)
}

function exceedsTerminalWindow(snapshot: BrowserAccountSnapshot): boolean {
  const limit = snapshot.window.terminal_command_limit
  if (limit < 0) return true
  let terminal = 0
  for (const command of snapshot.commands) {
    if (isTerminalCommand(command.lifecycle) && ++terminal > limit) return true
  }
  return false
}
