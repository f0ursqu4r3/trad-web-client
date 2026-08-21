import type { BrowserAccountSnapshot, TrailingEntryProjection } from '../gateway/index.ts'
import type { ManagedTradeView } from './tradeWorkspaceTypes.ts'

export function managedTradeTrailingEntries(
  trade: ManagedTradeView,
  snapshot: BrowserAccountSnapshot,
): TrailingEntryProjection[] {
  const commandIds = new Set(trade.commands.map((command) => command.command_id))
  return snapshot.trailing_entries
    .filter((entry) => commandIds.has(entry.command_id))
    .sort(compareEntries)
}

function compareEntries(left: TrailingEntryProjection, right: TrailingEntryProjection): number {
  const active = Number(isActive(right)) - Number(isActive(left))
  return active || right.created_at - left.created_at
}

function isActive(entry: TrailingEntryProjection): boolean {
  return !['succeeded', 'failed', 'canceled'].includes(entry.lifecycle)
}
