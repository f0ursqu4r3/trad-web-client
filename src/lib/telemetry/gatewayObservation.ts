import type {
  BrowserAccountDelta,
  BrowserCommandIntent,
  BrowserCommandOutcome,
  BrowserPreviewIntent,
  BrowserPreviewOutcome,
  BrowserPositionResolutionOutcome,
  BrowserSnapshotCause,
  GatewayConnectionStatus,
} from '@/lib/gateway'

import {
  newActionAttemptId,
  recordTelemetry,
  setTelemetryConnectionState,
  type TelemetryActionKind,
  type TelemetryBlockerCode,
} from './index.ts'

export interface GatewayActionAttempt {
  accountId: string
  actionAttemptId: string
  actionKind: TelemetryActionKind
  requestId: string
}

type CommandLink = GatewayActionAttempt

const MAX_COMMAND_LINKS = 1_024

export class GatewayTelemetryObserver {
  private readonly commandLinks = new Map<string, CommandLink>()

  attempt(
    intent: BrowserCommandIntent | BrowserPreviewIntent,
    accountId: string,
    requestId: string,
    actionAttemptId = newActionAttemptId(),
  ): GatewayActionAttempt {
    return { accountId, requestId, actionAttemptId, actionKind: commandAction(intent) }
  }

  positionAttempt(accountId: string, requestId: string): GatewayActionAttempt {
    return {
      accountId,
      requestId,
      actionAttemptId: newActionAttemptId(),
      actionKind: 'resolve_position',
    }
  }

  blockedPosition(accountId: string | null, blockerCode: TelemetryBlockerCode): void {
    this.blocked(newActionAttemptId(), 'resolve_position', accountId, blockerCode)
  }

  connection(status: GatewayConnectionStatus): void {
    setTelemetryConnectionState(connectionState(status))
  }

  accountSelected(accountId: string): void {
    recordTelemetry({
      eventName: 'account_selected',
      accountId,
      properties: { source: 'account_selector' },
    })
  }

  sync(accountId: string | null, next: string, previous: string | undefined): void {
    recordTelemetry({
      eventName: 'sync_state_changed',
      accountId,
      properties: { previous_state: previous ?? 'idle', state: next },
    })
  }

  blocked(
    actionAttemptId: string,
    actionKind: TelemetryActionKind,
    accountId: string | null,
    blockerCode: TelemetryBlockerCode,
  ): void {
    recordTelemetry({
      eventName: 'action_blocked',
      accountId,
      actionAttemptId,
      properties: { action_kind: actionKind, blocker_code: blockerCode },
    })
  }

  blockedIntent(
    intent: BrowserCommandIntent | BrowserPreviewIntent,
    accountId: string | null,
    blockerCode: TelemetryBlockerCode,
    actionAttemptId = newActionAttemptId(),
  ): void {
    this.blocked(actionAttemptId, commandAction(intent), accountId, blockerCode)
  }

  readinessBlocked(attempt: GatewayActionAttempt, reason: string | null): void {
    this.blocked(
      attempt.actionAttemptId,
      attempt.actionKind,
      attempt.accountId,
      readinessBlocker(reason),
    )
  }

  submitted(attempt: GatewayActionAttempt, source = 'gateway_command'): void {
    this.emit('action_submitted', attempt, { source })
    this.emit('request_queued', attempt)
  }

  requestSent(attempt: GatewayActionAttempt): void {
    this.emit('request_sent', attempt)
  }

  timedOut(attempt: GatewayActionAttempt, outcomeCode = 'outcome_unknown'): void {
    this.emit('request_timeout', attempt, { outcome_code: outcomeCode })
    this.emit('action_timed_out', attempt, { outcome_code: outcomeCode })
  }

  interrupted(attempt: GatewayActionAttempt): void {
    this.emit('action_timed_out', attempt, { outcome_code: 'transport_interrupted' })
  }

  sendFailed(attempt: GatewayActionAttempt): void {
    this.emit('action_rejected', attempt, {
      blocker_code: 'TRANSPORT_OFFLINE',
      outcome_code: 'send_failed',
    })
  }

  commandResult(attempt: GatewayActionAttempt, outcome: BrowserCommandOutcome): void {
    this.emit('response_received', attempt, { outcome_code: outcome.kind })
    if (outcome.kind === 'accepted') {
      this.emit('action_accepted', attempt, { outcome_code: 'accepted' }, outcome.command_id)
      this.emit('command_route_accepted', attempt, {}, outcome.command_id)
      this.emit('durable_command_linked', attempt, {}, outcome.command_id)
      this.commandLinks.set(outcome.command_id, attempt)
      if (this.commandLinks.size > MAX_COMMAND_LINKS) {
        const oldest = this.commandLinks.keys().next().value
        if (oldest !== undefined) this.commandLinks.delete(oldest)
      }
      return
    }
    this.emit('action_rejected', attempt, {
      blocker_code: rejectionBlocker(outcome.rejection.code),
      outcome_code: outcome.rejection.code,
    })
    this.emit('command_route_rejected', attempt, { reason_code: outcome.rejection.code })
  }

  previewRequested(attempt: GatewayActionAttempt): void {
    this.emit('preview_requested', attempt)
    this.emit('request_queued', attempt)
  }

  previewResult(attempt: GatewayActionAttempt, outcome: BrowserPreviewOutcome): void {
    this.emit('response_received', attempt, { outcome_code: outcome.kind })
    if (outcome.kind === 'ready') {
      this.emit('preview_ready', attempt, { outcome_code: 'ready' })
      return
    }
    this.emit('preview_rejected', attempt, { outcome_code: outcome.rejection.code })
  }

  positionResult(attempt: GatewayActionAttempt, outcome: BrowserPositionResolutionOutcome): void {
    this.emit('response_received', attempt, { outcome_code: outcome.kind })
    if (outcome.kind === 'accepted') {
      this.emit('action_accepted', attempt, { outcome_code: 'accepted' })
      return
    }
    this.emit('action_rejected', attempt, {
      blocker_code: 'POSITION_INCONSISTENT',
      outcome_code: outcome.rejection.code,
    })
  }

  snapshot(accountId: string, revision: number, cause: BrowserSnapshotCause): void {
    recordTelemetry({
      eventName: 'projection_snapshot_applied',
      accountId,
      projectionRevision: revision,
      properties: { source: cause.kind },
    })
    if (cause.kind === 'subscriber_lag') {
      recordTelemetry({
        eventName: 'projection_gap_detected',
        accountId,
        projectionRevision: revision,
        properties: { gap_size: cause.skipped, source: 'subscriber_lag' },
      })
    }
  }

  projectionGap(accountId: string, revision: number): void {
    recordTelemetry({
      eventName: 'projection_gap_detected',
      accountId,
      projectionRevision: revision,
      properties: { source: 'delta_rejected' },
    })
  }

  accountUnavailable(accountId: string, kind: string): void {
    recordTelemetry({
      eventName: 'account_unavailable_shown',
      accountId,
      properties: {
        blocker_code: kind === 'unauthorized' ? 'ENTITLEMENT_DENIED' : 'ACCOUNT_NOT_HYDRATED',
        reason_code: kind,
      },
    })
  }

  resnapshot(accountId: string): void {
    recordTelemetry({
      eventName: 'resnapshot_requested',
      accountId,
      properties: { source: 'projection_recovery' },
    })
  }

  terminalCommands(commands: BrowserAccountDelta['commands'], revision: number): void {
    for (const command of commands) {
      if (command.lifecycle === 'running') continue
      const link = this.commandLinks.get(command.command_id)
      if (link === undefined) continue
      recordTelemetry({
        eventName: 'command_terminal_observed',
        accountId: link.accountId,
        actionAttemptId: link.actionAttemptId,
        requestId: link.requestId,
        commandId: command.command_id,
        projectionRevision: revision,
        properties: {
          action_kind: link.actionKind,
          command_lifecycle: command.lifecycle,
          outcome_code: command.lifecycle,
        },
      })
      recordTelemetry({
        eventName: 'action_outcome_observed',
        accountId: link.accountId,
        actionAttemptId: link.actionAttemptId,
        requestId: link.requestId,
        commandId: command.command_id,
        projectionRevision: revision,
        properties: { action_kind: link.actionKind, outcome_code: command.lifecycle },
      })
      if (command.lifecycle === 'failed' || command.lifecycle === 'reconciliation_required') {
        recordTelemetry({
          eventName: 'venue_rejection_observed',
          accountId: link.accountId,
          actionAttemptId: link.actionAttemptId,
          requestId: link.requestId,
          commandId: command.command_id,
          properties: { action_kind: link.actionKind, outcome_code: command.lifecycle },
        })
      }
      this.commandLinks.delete(command.command_id)
    }
  }

  private emit(
    eventName:
      | 'action_submitted'
      | 'request_queued'
      | 'request_sent'
      | 'request_timeout'
      | 'action_timed_out'
      | 'action_rejected'
      | 'response_received'
      | 'action_accepted'
      | 'durable_command_linked'
      | 'command_route_accepted'
      | 'command_route_rejected'
      | 'preview_requested'
      | 'preview_ready'
      | 'preview_rejected',
    attempt: GatewayActionAttempt,
    properties: {
      source?: string
      blocker_code?: TelemetryBlockerCode
      outcome_code?: string
      reason_code?: string
    } = {},
    commandId?: string,
  ): void {
    recordTelemetry({
      eventName,
      accountId: attempt.accountId,
      actionAttemptId: attempt.actionAttemptId,
      requestId: attempt.requestId,
      commandId,
      properties: { action_kind: attempt.actionKind, ...properties },
    })
  }
}

function connectionState(status: GatewayConnectionStatus) {
  switch (status) {
    case 'ready':
      return 'connected' as const
    case 'connecting':
    case 'authenticating':
    case 'reconnecting':
      return 'reconnecting' as const
    case 'idle':
    case 'error':
      return navigator.onLine ? ('unavailable' as const) : ('offline' as const)
  }
}

function commandAction(intent: BrowserCommandIntent | BrowserPreviewIntent): TelemetryActionKind {
  switch (intent.kind) {
    case 'place_order':
      return 'place_order'
    case 'place_chase':
      return 'place_chase'
    case 'place_trailing_entry':
      return 'place_trailing_entry'
    case 'amend_trailing_entry':
      return 'amend_trailing_entry'
    case 'activate_trailing_entry':
    case 'enter_trailing_entry':
      return 'activate_trailing_entry'
    case 'continue_trailing_entry':
      return 'continue_trailing_entry'
    case 'modify_order':
      return 'modify'
    case 'cancel_order':
    case 'cancel_chase':
    case 'cancel_trailing_entry':
    case 'cancel_entry_work':
      return 'cancel'
    case 'close_exposure':
    case 'close_trailing_entry':
      return 'partial_close'
    case 'take_over_exposure':
      return 'take_over'
    case 'flatten':
      return 'flatten'
    case 'set_leverage':
      return 'set_leverage'
    case 'set_position_mode':
      return 'set_position_mode'
    case 'amend_protection':
      return 'edit_protection'
  }
}

function readinessBlocker(reason: string | null): TelemetryBlockerCode {
  const normalized = reason?.toLowerCase() ?? ''
  if (normalized.includes('not connected')) return 'TRANSPORT_OFFLINE'
  if (normalized.includes('not hydrated') || normalized.includes('unavailable'))
    return 'ACCOUNT_NOT_HYDRATED'
  if (normalized.includes('stale')) return 'PROJECTION_STALE'
  if (normalized.includes('agent')) return 'AGENT_APPROVAL_REQUIRED'
  return 'UNCLASSIFIED_BLOCKER'
}

function rejectionBlocker(code: string): TelemetryBlockerCode {
  switch (code) {
    case 'account_unavailable':
      return 'ACCOUNT_NOT_HYDRATED'
    case 'routing_changed':
      return 'SYNC_UNAVAILABLE'
    case 'unauthorized':
      return 'ENTITLEMENT_DENIED'
    case 'invalid_intent':
    case 'planning_failed':
    case 'engine_rejected':
      return 'COMMAND_REJECTED'
    default:
      return 'UNCLASSIFIED_BLOCKER'
  }
}
