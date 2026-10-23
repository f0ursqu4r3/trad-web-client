// The gateway's side of resume for the scripted workspace socket
// (e2e/support/workspaceWire.ts): one stream with the deltas committed since
// its snapshot, the account as a fresh subscriber would get it, and the
// ways a resume is refused (another stream, an evicted revision) or goes
// wrong (a hole in the missed deltas).

import type { Json } from './workspaceWire'

// Row identities, as the hub and the browser upsert them.
const IDENTITIES: Record<string, string> = {
  commands: 'command_id',
  execution_groups: 'group_id',
  chases: 'chase_id',
  trailing_entries: 'trailing_entry_id',
  close_workflows: 'close_workflow_id',
  flatten_workflows: 'flatten_workflow_id',
  entry_cancellations: 'cancellation_id',
  account_controls: 'control_id',
  protection_amendments: 'amendment_id',
  native_protections: 'protection_id',
  orders: 'order_id',
  positions: 'symbol',
  executions: 'event_id',
  balances: 'asset',
  protections: 'remote_order_id',
  trade_summaries: 'trade_id',
}

export interface ResumePoint {
  stream_id: string
  projection_revision: number
}

export class ResumeServer {
  streamId: string
  // The account now: what a subscriber without a resume point gets.
  current: Json
  // Deltas after `base`, oldest first.
  private ring: Json[] = []
  private base: number
  private holeNext = false
  private streams = 0

  constructor(snapshot: Json) {
    this.current = structuredClone(snapshot)
    this.base = this.revision()
    this.streamId = this.nextStreamId()
  }

  revision(): number {
    return this.current.checkpoint.projection_revision
  }

  // A delta at the next revision: kept for resume and applied to `current`.
  commit(delta: Json): void {
    this.ring.push(structuredClone(delta))
    this.current = merged(this.current, delta)
  }

  // The deltas a tab at `point` missed, or null for a snapshot.
  answer(point: ResumePoint | undefined): Json[] | null {
    if (point === undefined || point.stream_id !== this.streamId) return null
    const revision = point.projection_revision
    if (revision < this.base || revision > this.revision()) return null
    const missed = this.ring.slice(revision - this.base)
    if (this.holeNext && missed.length > 1) {
      this.holeNext = false
      missed.splice(0, 1)
    }
    return missed
  }

  // The deltas committed after `revision` (that the ring still holds).
  deltasAfter(revision: number): Json[] {
    return this.ring.slice(Math.max(0, revision - this.base))
  }

  // An upstream resync, node restart or Gateway restart: a new stream.
  newStream(): void {
    this.streamId = this.nextStreamId()
    this.evict()
  }

  // A drop longer than the ring keeps.
  evict(): void {
    this.ring = []
    this.base = this.revision()
  }

  // The next resume leaves out its first missed delta (a server bug the
  // client must not install).
  breakNextResume(): void {
    this.holeNext = true
  }

  private nextStreamId(): string {
    this.streams += 1
    return `57e40000-0000-4000-8000-${String(this.streams).padStart(12, '0')}`
  }
}

// The gateway's answer to a subscribe_account: the missed deltas when the
// page's resume point is inside the stream, else the current snapshot.
export function resumeReply(server: ResumeServer, subscribe: Json, subscriptionId: string): Json {
  const route = { exchange: 'hyperliquid', network: 'testnet', account_id: subscribe.account_id }
  const missed = server.answer(subscribe.resume_from_revision)
  if (missed !== null) {
    return {
      kind: 'account_resumed',
      request_id: subscribe.request_id,
      subscription_id: subscriptionId,
      route,
      stream_id: server.streamId,
      deltas: missed,
    }
  }
  return {
    kind: 'account_snapshot',
    request_id: subscribe.request_id,
    subscription_id: subscriptionId,
    route,
    cause: { kind: 'initial' },
    stream_id: server.streamId,
    snapshot: server.current,
  }
}

export function merged(snapshot: Json, delta: Json): Json {
  const next = { ...snapshot, checkpoint: delta.checkpoint }
  for (const [field, identity] of Object.entries(IDENTITIES)) {
    const incoming = delta[field] as Json[] | undefined
    if (incoming === undefined || incoming.length === 0) continue
    const rows = new Map<string, Json>(
      ((snapshot[field] as Json[] | undefined) ?? []).map((row) => [String(row[identity]), row]),
    )
    for (const row of incoming) rows.set(String(row[identity]), row)
    next[field] = Array.from(rows.values())
  }
  if (Array.isArray(delta.removed_trade_summaries) && Array.isArray(next.trade_summaries)) {
    const removed = new Set(delta.removed_trade_summaries)
    next.trade_summaries = next.trade_summaries.filter((row: Json) => !removed.has(row.trade_id))
  }
  if (delta.replace_external_order_inventory === true) {
    next.external_orders = delta.external_orders ?? []
  }
  if (Array.isArray(delta.relationships) && delta.relationships.length > 0) {
    const edges = new Map<string, Json>(
      [...(snapshot.relationships ?? []), ...delta.relationships].map((edge: Json) => [
        JSON.stringify(edge),
        edge,
      ]),
    )
    next.relationships = Array.from(edges.values())
  }
  return next
}

// A projection with every array in a stable order, so two tabs' copies
// compare by content.
export function normalized(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(normalized)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Json)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalized(entry)]),
    )
  }
  return value
}
