import type {
  BrowserAccountDelta,
  ExternalOrderProjection,
  PresentationRelationship,
  Uuid,
} from '../gateway/index.ts'
import { applyDelta, type AccountProjectionView } from './accountProjection.ts'

// Protocol 17 deltas (the backend's gateway-contracts delta_patch.rs,
// object_patch.rs and delta_fills.rs): a patch against the window this tab
// holds, one revision back, expanded here into exactly the full delta the
// gateway would have sent, so applyDelta and everything after it are
// unchanged.
//
// - `checkpoint`: an object patch of the previous checkpoint;
// - each row collection, in the delta's order: `{"$id": key, ...patch}`
//   patches the window's row with that key; `{"$prev": true, ...patch}`
//   patches the row before it in this list; anything else is a whole row;
// - a new fill (not `$id`) leaves out the outer `event_id` (it is
//   `fill.event_id`) and `fill.event_id` when it is
//   `hyperliquid:fill:<transaction_hash>:<execution_id>`.
//
// An object patch holds the changed keys: a nested patch for an object
// that stays an object, `{"$set": value}` for any other object value, the
// plain value otherwise (arrays whole), and `"$unset": [keys]`. Rows are
// never edited in place: a patched row is a new object sharing what did
// not change.

type Json = Record<string, unknown>

export interface BrowserAccountPatch {
  checkpoint: Json
  commands?: Json[]
  execution_groups?: Json[]
  chases?: Json[]
  trailing_entries?: Json[]
  close_workflows?: Json[]
  flatten_workflows?: Json[]
  entry_cancellations?: Json[]
  account_controls?: Json[]
  protection_amendments?: Json[]
  native_protections?: Json[]
  orders?: Json[]
  positions?: Json[]
  executions?: Json[]
  balances?: Json[]
  protections?: Json[]
  external_orders?: ExternalOrderProjection[]
  replace_external_order_inventory?: boolean
  relationships?: PresentationRelationship[]
  trade_summaries?: Json[]
  removed_trade_summaries?: Uuid[]
}

// What an account subscription delivers next: a whole delta (protocol 16)
// or a patch (17). Both message kinds fit as they are.
export type AccountChange = { delta: BrowserAccountDelta } | { patch: BrowserAccountPatch }

export class AccountPatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccountPatchError'
  }
}

export function changeDelta(
  view: AccountProjectionView,
  change: AccountChange,
): BrowserAccountDelta {
  return 'delta' in change ? change.delta : expandAccountPatch(view, change.patch)
}

// The revision a change moves to, for telemetry when it cannot apply.
export function changeRevision(change: AccountChange): number | null {
  if ('delta' in change) return change.delta.checkpoint.projection_revision
  const revision = change.patch.checkpoint.projection_revision
  return typeof revision === 'number' ? revision : null
}

export function expandAccountPatch(
  view: AccountProjectionView,
  patch: BrowserAccountPatch,
): BrowserAccountDelta {
  const live = view.live
  const rows = (name: string, existing: readonly unknown[], key: string, fills = false) =>
    expandRows(name, existing as Json[], patchRows(patch, name), key, fills)
  const delta: Json = {
    checkpoint: applyObjectPatch(live.checkpoint as unknown as Json, patch.checkpoint),
    commands: rows('commands', live.commands, 'command_id'),
    execution_groups: rows('execution_groups', live.execution_groups, 'group_id'),
    chases: rows('chases', live.chases, 'chase_id'),
    trailing_entries: rows('trailing_entries', live.trailing_entries, 'trailing_entry_id'),
    close_workflows: rows('close_workflows', live.close_workflows, 'close_workflow_id'),
    flatten_workflows: rows('flatten_workflows', live.flatten_workflows, 'flatten_workflow_id'),
    entry_cancellations: rows('entry_cancellations', live.entry_cancellations, 'cancellation_id'),
    account_controls: rows('account_controls', live.account_controls, 'control_id'),
    protection_amendments: rows(
      'protection_amendments',
      live.protection_amendments,
      'amendment_id',
    ),
    native_protections: rows('native_protections', live.native_protections, 'protection_id'),
    orders: rows('orders', live.orders, 'order_id'),
    positions: rows('positions', live.positions, 'symbol'),
    executions: rows('executions', live.executions, 'event_id', true),
    balances: rows('balances', live.balances, 'asset'),
    protections: rows('protections', live.protections, 'remote_order_id'),
    external_orders: patch.external_orders ?? [],
    replace_external_order_inventory: patch.replace_external_order_inventory ?? false,
    relationships: patch.relationships ?? [],
  }
  const summaries = Array.from(view.summaries?.values() ?? []) as unknown as Json[]
  const changed = expandRows('trade_summaries', summaries, patch.trade_summaries ?? [], 'trade_id')
  if (changed.length > 0) delta.trade_summaries = changed
  if ((patch.removed_trade_summaries ?? []).length > 0) {
    delta.removed_trade_summaries = patch.removed_trade_summaries
  }
  return delta as unknown as BrowserAccountDelta
}

function patchRows(patch: BrowserAccountPatch, name: string): Json[] {
  const rows = (patch as unknown as Record<string, unknown>)[name]
  if (rows === undefined) return []
  if (!Array.isArray(rows)) throw new AccountPatchError(`${name} is not a list`)
  return rows as Json[]
}

function expandRows(
  name: string,
  existing: readonly Json[],
  entries: readonly Json[],
  key: string,
  fills = false,
): Json[] {
  const rows: Json[] = []
  let previous: Json | null = null
  for (const entry of entries) {
    if (!isObject(entry)) throw new AccountPatchError(`${name} entry is not an object`)
    const { $id: id, $prev: afterPrevious, ...changes } = entry
    let row: Json
    if (id !== undefined) {
      const old = existing.find((candidate) => sameKey(candidate[key], id))
      if (old === undefined) {
        throw new AccountPatchError(`${name} row ${JSON.stringify(id)} is not in the window`)
      }
      row = applyObjectPatch(old, changes)
    } else if (afterPrevious !== undefined) {
      if (previous === null) throw new AccountPatchError(`${name}: $prev on the first row`)
      row = applyObjectPatch(previous, changes)
    } else {
      row = changes
    }
    if (fills && id === undefined) row = restoreFillIds(changes, row)
    rows.push(row)
    previous = row
  }
  return rows
}

// A new fill's left-out event ids, back from the rest of the row.
function restoreFillIds(entry: Json, row: Json): Json {
  const fill = row.fill
  if (!isObject(fill)) throw new AccountPatchError('a new fill row has no fill')
  let restored = row
  if (!fillIdSent(entry.fill)) {
    const hash = fill.transaction_hash
    const execution = fill.execution_id
    if (typeof hash !== 'string' || typeof execution !== 'string') {
      throw new AccountPatchError('a new fill left out an event id it cannot derive')
    }
    const event_id = `hyperliquid:fill:${hash}:${execution}`
    restored = { ...restored, fill: { ...fill, event_id } }
  }
  if (!('event_id' in entry)) {
    restored = { ...restored, event_id: (restored.fill as Json).event_id }
  }
  return restored
}

function fillIdSent(fill: unknown): boolean {
  if (!isObject(fill)) return false
  const whole = fill.$set
  return isObject(whole) ? 'event_id' in whole : 'event_id' in fill
}

export function applyObjectPatch(target: Json, patch: Json): Json {
  const result: Json = { ...target }
  const removed = patch.$unset
  if (removed !== undefined) {
    if (!Array.isArray(removed)) throw new AccountPatchError('$unset is not a list')
    for (const key of removed) delete result[String(key)]
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === '$unset') continue
    if (!isObject(value)) {
      result[key] = value
      continue
    }
    if ('$set' in value) {
      result[key] = value.$set
      continue
    }
    const existing = target[key]
    if (!isObject(existing)) {
      throw new AccountPatchError(`${key}: a nested patch for a value that is not an object`)
    }
    result[key] = applyObjectPatch(existing, value)
  }
  return result
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameKey(left: unknown, right: unknown): boolean {
  if (typeof left === 'string' || typeof right === 'string') return left === right
  return JSON.stringify(left) === JSON.stringify(right)
}

// Changes applied in order to a copy: the new view and the full deltas,
// or a throw that leaves `view` as it was (a resume applies all or none).
export function applyChanges(
  view: AccountProjectionView,
  changes: readonly AccountChange[],
): { view: AccountProjectionView; deltas: BrowserAccountDelta[] } {
  let next = view
  const deltas: BrowserAccountDelta[] = []
  for (const change of changes) {
    const delta = changeDelta(next, change)
    next = applyDelta(next, delta)
    deltas.push(delta)
  }
  return { view: next, deltas }
}

// What an account_resumed message carries.
export interface ResumedChanges {
  subscription_id: Uuid
  stream_id: Uuid
  deltas: BrowserAccountDelta[]
  patches?: BrowserAccountPatch[]
}

// A resume's changes: protocol 17 sends patches, 16 whole deltas.
export function resumedChanges(message: ResumedChanges): AccountChange[] {
  if (message.patches !== undefined && message.patches.length > 0) {
    return message.patches.map((patch) => ({ patch }))
  }
  return message.deltas.map((delta) => ({ delta }))
}
