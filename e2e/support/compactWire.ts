// The gateway's protocol 17 encodings for the scripted workspace socket
// (e2e/support/workspaceWire.ts): large messages as `message_part` frames
// (gateway browser_socket/message_parts.rs), paced, cut short or missing a
// part on request; deltas as patches against the window the page holds
// (gateway-contracts delta_patch.rs, without the fill and previous-row
// forms, which the unit golden covers).

import type { Json, WireSocket } from './workspaceWire'

export interface PartOptions {
  // Messages longer than this go in parts of this many characters.
  bytes: number
  // Pause between parts, so prices can go between them.
  gapMs?: number
  // The first transfer stops after this many parts and the socket drops.
  dropAfterParts?: number
  // The first transfer leaves out this part.
  skipPart?: number
}

// What the page has been sent in parts.
export interface PartTraffic {
  transfers: number
  completed: number
  parts: number
  inProgress: boolean
}

export function newPartTraffic(): PartTraffic {
  return { transfers: 0, completed: 0, parts: 0, inProgress: false }
}

// Sends `text` (the JSON of one message) as parts, on the gateway's rules.
export async function sendInParts(
  ws: WireSocket,
  text: string,
  options: PartOptions,
  traffic: PartTraffic,
): Promise<void> {
  const message = JSON.parse(text) as Json
  const first = traffic.transfers === 0
  traffic.transfers += 1
  traffic.inProgress = true
  const transfer = traffic.transfers
  const count = Math.ceil(text.length / options.bytes)
  for (let part = 0; part < count; part += 1) {
    if (first && options.dropAfterParts === part) {
      traffic.inProgress = false
      await ws.close({ code: 1011, reason: 'test drop mid-transfer' })
      return
    }
    const header: Json = { kind: 'message_part', transfer, part, parts: count }
    if (part === 0) {
      header.message_kind = message.kind
      if (typeof message.request_id === 'string') header.request_id = message.request_id
      if (typeof message.subscription_id === 'string')
        header.subscription_id = message.subscription_id
    }
    const slice = text.slice(part * options.bytes, (part + 1) * options.bytes)
    if (!(first && options.skipPart === part)) {
      ws.send(`${JSON.stringify(header)}\n${slice}`)
      traffic.parts += 1
    }
    if (options.gapMs !== undefined)
      await new Promise((resolve) => setTimeout(resolve, options.gapMs))
  }
  traffic.inProgress = false
  traffic.completed += 1
}

// Row identities, as the hub keys them.
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
}

// The delta as a patch against `window` (what the page holds).
export function deltaPatch(window: Json, delta: Json): Json {
  const patch: Json = { checkpoint: objectPatch(window.checkpoint, delta.checkpoint) }
  for (const [field, key] of Object.entries(IDENTITIES)) {
    const rows = (delta[field] ?? []) as Json[]
    if (rows.length === 0) continue
    const held = new Map(((window[field] ?? []) as Json[]).map((row) => [String(row[key]), row]))
    patch[field] = rows.map((row) => {
      const old = held.get(String(row[key]))
      return old === undefined ? row : { $id: row[key], ...objectPatch(old, row) }
    })
  }
  for (const field of ['relationships', 'external_orders']) {
    if (Array.isArray(delta[field]) && delta[field].length > 0) patch[field] = delta[field]
  }
  if (delta.replace_external_order_inventory === true) patch.replace_external_order_inventory = true
  return patch
}

function objectPatch(old: Json, value: Json): Json {
  const patch: Json = {}
  for (const [key, entry] of Object.entries(value)) {
    const before = old[key]
    if (JSON.stringify(before) === JSON.stringify(entry)) continue
    const nested = isObject(before) && isObject(entry)
    patch[key] = nested ? objectPatch(before, entry) : isObject(entry) ? { $set: entry } : entry
  }
  const removed = Object.keys(old).filter((key) => !(key in value))
  if (removed.length > 0) patch.$unset = removed
  return patch
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
