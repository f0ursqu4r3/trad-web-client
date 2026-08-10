import type {
  BrowserAccountSnapshot,
  CommandLifecycle,
  CommandProjection,
  ExecutionProjection,
  PresentationRelationship,
  ProjectionGraph,
  ProjectionNodeId,
  Uuid,
} from '../gateway/index.ts'

export function isTerminalCommand(lifecycle: CommandLifecycle): boolean {
  return lifecycle === 'succeeded' || lifecycle === 'failed' || lifecycle === 'canceled'
}

export function pruneLiveSnapshot(snapshot: BrowserAccountSnapshot): BrowserAccountSnapshot {
  const selectedCommands = selectRecentCommands(
    snapshot.commands,
    snapshot.window.terminal_command_limit,
  )
  const selectedNodes = expandDescendants(snapshot.relationships, selectedCommands)

  const commands = snapshot.commands
    .filter((command) => selectedCommands.has(command.command_id))
    .sort((left, right) => left.command_id.localeCompare(right.command_id))
  const executionGroups = snapshot.execution_groups.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'execution_group', id: row.group_id })),
  )
  const chases = snapshot.chases.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'chase', id: row.chase_id })),
  )
  const trailingEntries = snapshot.trailing_entries.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'trailing_entry', id: row.trailing_entry_id })),
  )
  const closeWorkflows = snapshot.close_workflows.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'close_workflow', id: row.close_workflow_id })),
  )
  const flattenWorkflows = snapshot.flatten_workflows.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'flatten_workflow', id: row.flatten_workflow_id })),
  )
  const entryCancellations = snapshot.entry_cancellations.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'entry_cancellation', id: row.cancellation_id })),
  )
  const accountControls = snapshot.account_controls.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'account_control', id: row.control_id })),
  )
  const orders = snapshot.orders.filter((row) =>
    selectedNodes.has(nodeKey({ kind: 'order', id: row.order_id })),
  )
  const executions = snapshot.executions.filter(
    (row) =>
      row.order === null || selectedNodes.has(nodeKey({ kind: 'order', id: row.order.order_id })),
  )
  const relationships = snapshot.relationships.filter(
    (edge) => selectedNodes.has(nodeKey(edge.parent)) && selectedNodes.has(nodeKey(edge.child)),
  )
  const includedCommands = commands.length
  const totalCommands = snapshot.checkpoint.summary.commands

  return {
    ...snapshot,
    commands,
    execution_groups: executionGroups,
    chases,
    trailing_entries: trailingEntries,
    close_workflows: closeWorkflows,
    flatten_workflows: flattenWorkflows,
    entry_cancellations: entryCancellations,
    account_controls: accountControls,
    orders,
    executions,
    relationships,
    window: {
      ...snapshot.window,
      total_commands: totalCommands,
      included_commands: includedCommands,
      older_terminal_commands_available: includedCommands < totalCommands,
    },
  }
}

export function mergeGraph(preferred: ProjectionGraph, fallback: ProjectionGraph): ProjectionGraph {
  return {
    commands: mergeRows(fallback.commands, preferred.commands, (row) => row.command_id),
    execution_groups: mergeRows(
      fallback.execution_groups,
      preferred.execution_groups,
      (row) => row.group_id,
    ),
    chases: mergeRows(fallback.chases, preferred.chases, (row) => row.chase_id),
    trailing_entries: mergeRows(
      fallback.trailing_entries,
      preferred.trailing_entries,
      (row) => row.trailing_entry_id,
    ),
    close_workflows: mergeRows(
      fallback.close_workflows,
      preferred.close_workflows,
      (row) => row.close_workflow_id,
    ),
    flatten_workflows: mergeRows(
      fallback.flatten_workflows,
      preferred.flatten_workflows,
      (row) => row.flatten_workflow_id,
    ),
    entry_cancellations: mergeRows(
      fallback.entry_cancellations,
      preferred.entry_cancellations,
      (row) => row.cancellation_id,
    ),
    account_controls: mergeRows(
      fallback.account_controls,
      preferred.account_controls,
      (row) => row.control_id,
    ),
    orders: mergeRows(fallback.orders, preferred.orders, (row) => row.order_id),
    executions: mergeRows(fallback.executions, preferred.executions, (row) => row.event_id),
    relationships: mergeRelationships(fallback.relationships, preferred.relationships),
  }
}

export function upsertSnapshotGraph(
  snapshot: BrowserAccountSnapshot,
  delta: ProjectionGraph,
): BrowserAccountSnapshot {
  return {
    ...snapshot,
    commands: mergeRows(snapshot.commands, delta.commands, (row) => row.command_id),
    execution_groups: mergeRows(
      snapshot.execution_groups,
      delta.execution_groups,
      (row) => row.group_id,
    ),
    chases: mergeRows(snapshot.chases, delta.chases, (row) => row.chase_id),
    trailing_entries: mergeRows(
      snapshot.trailing_entries,
      delta.trailing_entries,
      (row) => row.trailing_entry_id,
    ),
    close_workflows: mergeRows(
      snapshot.close_workflows,
      delta.close_workflows,
      (row) => row.close_workflow_id,
    ),
    flatten_workflows: mergeRows(
      snapshot.flatten_workflows,
      delta.flatten_workflows,
      (row) => row.flatten_workflow_id,
    ),
    entry_cancellations: mergeRows(
      snapshot.entry_cancellations,
      delta.entry_cancellations,
      (row) => row.cancellation_id,
    ),
    account_controls: mergeRows(
      snapshot.account_controls,
      delta.account_controls,
      (row) => row.control_id,
    ),
    orders: mergeRows(snapshot.orders, delta.orders, (row) => row.order_id),
    executions: mergeRows(snapshot.executions, delta.executions, (row) => row.event_id),
    relationships: mergeRelationships(snapshot.relationships, delta.relationships),
  }
}

export function graphNodes(graph: ProjectionGraph): Set<string> {
  const nodes = new Set<string>()
  addNodes(nodes, graph.commands, (row) => ({ kind: 'command', id: row.command_id }))
  addNodes(nodes, graph.execution_groups, (row) => ({
    kind: 'execution_group',
    id: row.group_id,
  }))
  addNodes(nodes, graph.chases, (row) => ({ kind: 'chase', id: row.chase_id }))
  addNodes(nodes, graph.trailing_entries, (row) => ({
    kind: 'trailing_entry',
    id: row.trailing_entry_id,
  }))
  addNodes(nodes, graph.close_workflows, (row) => ({
    kind: 'close_workflow',
    id: row.close_workflow_id,
  }))
  addNodes(nodes, graph.flatten_workflows, (row) => ({
    kind: 'flatten_workflow',
    id: row.flatten_workflow_id,
  }))
  addNodes(nodes, graph.entry_cancellations, (row) => ({
    kind: 'entry_cancellation',
    id: row.cancellation_id,
  }))
  addNodes(nodes, graph.account_controls, (row) => ({
    kind: 'account_control',
    id: row.control_id,
  }))
  addNodes(nodes, graph.orders, (row) => ({ kind: 'order', id: row.order_id }))
  return nodes
}

export function expandDescendants(
  relationships: PresentationRelationship[],
  commandIds: Iterable<Uuid>,
): Set<string> {
  const nodes = new Set(Array.from(commandIds, (id) => nodeKey({ kind: 'command', id })))
  let priorSize = -1

  while (nodes.size !== priorSize) {
    priorSize = nodes.size
    for (const edge of relationships) {
      if (nodes.has(nodeKey(edge.parent))) {
        nodes.add(nodeKey(edge.child))
      }
    }
  }
  return nodes
}

export function nodeKey(node: ProjectionNodeId): string {
  return `${node.kind}:${node.id}`
}

export function relationshipKey(edge: PresentationRelationship): string {
  return `${nodeKey(edge.parent)}>${edge.relationship}>${nodeKey(edge.child)}`
}

export function validateExecutionReferences(
  executions: ExecutionProjection[],
  nodes: Set<string>,
): boolean {
  return executions.every(
    (execution) =>
      execution.order !== null &&
      nodes.has(nodeKey({ kind: 'order', id: execution.order.order_id })),
  )
}

function selectRecentCommands(commands: CommandProjection[], terminalLimit: number): Set<Uuid> {
  const selected = new Set(
    commands.filter((command) => !isTerminalCommand(command.lifecycle)).map(commandId),
  )
  const terminal =
    terminalLimit === 0
      ? []
      : commands
          .filter((command) => isTerminalCommand(command.lifecycle))
          .sort(compareCommands)
          .slice(-terminalLimit)

  for (const command of terminal) {
    selected.add(command.command_id)
  }
  return selected
}

function compareCommands(left: CommandProjection, right: CommandProjection): number {
  return left.accepted_at - right.accepted_at || left.command_id.localeCompare(right.command_id)
}

function commandId(command: CommandProjection): Uuid {
  return command.command_id
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

function mergeRelationships(
  existing: PresentationRelationship[],
  incoming: PresentationRelationship[],
): PresentationRelationship[] {
  return mergeRows(existing, incoming, relationshipKey)
}

function addNodes<T>(target: Set<string>, rows: T[], identify: (row: T) => ProjectionNodeId): void {
  for (const row of rows) {
    target.add(nodeKey(identify(row)))
  }
}
