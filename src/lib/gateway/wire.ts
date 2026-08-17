import type { BrowserCommandIntent, Uuid } from './intent.ts'
import type { BrowserPreviewIntent, BrowserPreviewOutcome } from './preview.ts'
import type { BrowserMarketError, BrowserMarketSample, BrowserMarketWindow } from './market.ts'
import type {
  AccountRouteKey,
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  ClientCommandPage,
  CommandHistoryCursor,
  LegacyCommandPage,
  LegacyHistoryCursor,
  ProjectionRevision,
} from './projection.ts'

export const BROWSER_PROTOCOL_VERSION = 11

export interface BrowserPositionResolutionIntent {
  resolution_id: Uuid
  expected_account_revision: number
  cycle_id: Uuid
  generation: number
  exchange_event_id: string
  exchange_revision: number
  symbol: string
  side: 'long' | 'short'
  reductions: Array<{ scope_id: Uuid; quantity: string }>
}

export type BrowserClientMessage =
  | { kind: 'authenticate'; protocol_version: number; ticket: string }
  | { kind: 'subscribe_account'; request_id: Uuid; account_id: Uuid }
  | { kind: 'unsubscribe_account'; subscription_id: Uuid }
  | {
      kind: 'subscribe_market'
      request_id: Uuid
      account_id: Uuid
      symbol: string
      limit: number
    }
  | { kind: 'unsubscribe_market'; subscription_id: Uuid }
  | {
      kind: 'submit_command'
      request_id: Uuid
      account_id: Uuid
      intent: BrowserCommandIntent
    }
  | {
      kind: 'preview_command'
      request_id: Uuid
      account_id: Uuid
      intent: BrowserPreviewIntent
    }
  | { kind: 'refresh_reconciliation'; request_id: Uuid; account_id: Uuid }
  | {
      kind: 'resolve_position_deficit'
      request_id: Uuid
      account_id: Uuid
      resolution: BrowserPositionResolutionIntent
    }
  | {
      kind: 'request_command_history'
      request_id: Uuid
      account_id: Uuid
      expected_projection_revision: ProjectionRevision
      before: CommandHistoryCursor | null
      limit: number
    }
  | {
      kind: 'request_legacy_command_history'
      request_id: Uuid
      account_id: Uuid
      expected_projection_revision: ProjectionRevision
      before: LegacyHistoryCursor | null
      limit: number
    }
  | { kind: 'ping'; nonce: number }

export type BrowserSnapshotCause =
  | { kind: 'initial' }
  | { kind: 'upstream_resync' }
  | { kind: 'subscriber_lag'; skipped: number }

export type BrowserSubscriptionError =
  | { kind: 'unauthorized' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'resync_failed'; reason: string }

export type BrowserHistoryError =
  | { kind: 'invalid_request'; reason: string }
  | { kind: 'unauthorized' }
  | { kind: 'revision_changed'; expected: ProjectionRevision; actual: ProjectionRevision }
  | { kind: 'routing_changed'; reason: string }
  | { kind: 'unavailable'; reason: string; retryable: boolean }

export type BrowserCommandOutcome =
  | {
      kind: 'accepted'
      command_id: Uuid
      account_revision: number
      duplicate: boolean
    }
  | {
      kind: 'rejected'
      rejection: {
        code:
          | 'invalid_intent'
          | 'unauthorized'
          | 'account_unavailable'
          | 'routing_changed'
          | 'planning_failed'
          | 'engine_rejected'
        reason: string
        retryable: boolean
      }
    }

export type BrowserReconciliationRefreshOutcome =
  | { kind: 'accepted'; cycle_id: Uuid; duplicate: boolean }
  | {
      kind: 'rejected'
      rejection: {
        code: 'invalid_request' | 'unauthorized' | 'account_unavailable' | 'routing_changed'
        reason: string
        retryable: boolean
      }
    }

export type BrowserPositionResolutionOutcome =
  | {
      kind: 'accepted'
      resolution_id: Uuid
      account_revision: number
      duplicate: boolean
    }
  | {
      kind: 'rejected'
      rejection: {
        code:
          | 'invalid_request'
          | 'unauthorized'
          | 'account_unavailable'
          | 'routing_changed'
          | 'evidence_changed'
        reason: string
        retryable: boolean
      }
    }

export type BrowserServerMessage =
  | { kind: 'hello'; protocol_version: number; session_valid_for_ms: number }
  | {
      kind: 'account_snapshot'
      request_id: Uuid | null
      subscription_id: Uuid
      route: AccountRouteKey
      cause: BrowserSnapshotCause
      snapshot: BrowserAccountSnapshot
    }
  | {
      kind: 'account_delta'
      subscription_id: Uuid
      route: AccountRouteKey
      delta: BrowserAccountDelta
    }
  | {
      kind: 'account_error'
      request_id: Uuid | null
      subscription_id: Uuid | null
      account_id: Uuid
      error: BrowserSubscriptionError
    }
  | { kind: 'account_unsubscribed'; subscription_id: Uuid }
  | {
      kind: 'market_window'
      request_id: Uuid | null
      subscription_id: Uuid
      account_id: Uuid
      window: BrowserMarketWindow
    }
  | {
      kind: 'market_samples'
      subscription_id: Uuid
      account_id: Uuid
      symbol: string
      samples: BrowserMarketSample[]
    }
  | {
      kind: 'market_error'
      request_id: Uuid | null
      subscription_id: Uuid | null
      account_id: Uuid
      error: BrowserMarketError
    }
  | { kind: 'market_unsubscribed'; subscription_id: Uuid }
  | {
      kind: 'command_result'
      request_id: Uuid
      account_id: Uuid
      outcome: BrowserCommandOutcome
    }
  | {
      kind: 'command_preview_result'
      request_id: Uuid
      account_id: Uuid
      outcome: BrowserPreviewOutcome
    }
  | {
      kind: 'reconciliation_refresh_result'
      request_id: Uuid
      account_id: Uuid
      outcome: BrowserReconciliationRefreshOutcome
    }
  | {
      kind: 'position_resolution_result'
      request_id: Uuid
      account_id: Uuid
      outcome: BrowserPositionResolutionOutcome
    }
  | {
      kind: 'command_history_page'
      request_id: Uuid
      account_id: Uuid
      page: ClientCommandPage
    }
  | {
      kind: 'command_history_error'
      request_id: Uuid
      account_id: Uuid
      error: BrowserHistoryError
    }
  | {
      kind: 'legacy_command_history_page'
      request_id: Uuid
      account_id: Uuid
      page: LegacyCommandPage
    }
  | {
      kind: 'legacy_command_history_error'
      request_id: Uuid
      account_id: Uuid
      error: BrowserHistoryError
    }
  | { kind: 'pong'; nonce: number }
