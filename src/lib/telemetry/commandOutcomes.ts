import type { CommandLifecycle } from '../gateway/index.ts'
import type { TelemetryActionKind } from './catalog.ts'
import type { TelemetryRecord } from './contract.ts'

// What the projection says about an accepted command, as telemetry. Only a
// terminal lifecycle is the command's outcome: a command can pass through
// reconciliation_required and still succeed (a Chase cancel that raced a
// fill, 2026-10-29), so that state is neither an outcome nor a venue
// rejection, and the command stays linked until its real outcome arrives.

export interface CommandOutcomeLink {
  accountId: string
  actionAttemptId: string
  actionKind: TelemetryActionKind
  requestId: string
}

export type TerminalCommandLifecycle = Extract<
  CommandLifecycle,
  'succeeded' | 'partially_succeeded' | 'failed' | 'canceled'
>

export function terminalCommandLifecycle(
  lifecycle: CommandLifecycle,
): TerminalCommandLifecycle | null {
  switch (lifecycle) {
    case 'succeeded':
    case 'partially_succeeded':
    case 'failed':
    case 'canceled':
      return lifecycle
    case 'running':
    case 'reconciliation_required':
      return null
  }
}

// The records for one command row of a snapshot or delta; empty while the
// command has no outcome yet.
export function commandOutcomeRecords(
  link: CommandOutcomeLink,
  command: { command_id: string; lifecycle: CommandLifecycle },
  revision: number,
): TelemetryRecord[] {
  const outcome = terminalCommandLifecycle(command.lifecycle)
  if (outcome === null) return []
  const context = {
    accountId: link.accountId,
    actionAttemptId: link.actionAttemptId,
    requestId: link.requestId,
    commandId: command.command_id,
  }
  const records: TelemetryRecord[] = [
    {
      eventName: 'command_terminal_observed',
      ...context,
      projectionRevision: revision,
      properties: {
        action_kind: link.actionKind,
        command_lifecycle: outcome,
        outcome_code: outcome,
      },
    },
    {
      eventName: 'action_outcome_observed',
      ...context,
      projectionRevision: revision,
      properties: { action_kind: link.actionKind, outcome_code: outcome },
    },
  ]
  // An accepted command fails when the venue refuses what it sent; a wait
  // for reconciliation is not a rejection.
  if (outcome === 'failed') {
    records.push({
      eventName: 'venue_rejection_observed',
      ...context,
      properties: { action_kind: link.actionKind, outcome_code: outcome },
    })
  }
  return records
}

// `account_unavailable_shown` once per account and reason, not on every
// subscription retry (one unavailable account sent 1,124 in 8 hours). The
// account becoming available or being selected again shows it anew.
export class AccountUnavailableShown {
  private readonly shown = new Map<string, string>()

  shouldRecord(accountId: string, reasonCode: string): boolean {
    if (this.shown.get(accountId) === reasonCode) return false
    this.shown.set(accountId, reasonCode)
    return true
  }

  forget(accountId: string): void {
    this.shown.delete(accountId)
  }
}
