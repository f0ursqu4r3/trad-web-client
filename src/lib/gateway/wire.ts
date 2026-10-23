import type { BrowserCommandIntent, Uuid } from './intent.ts'
import type { BrowserPreviewIntent, BrowserPreviewOutcome } from './preview.ts'
import type {
  BrowserMarketError,
  BrowserMarketSample,
  BrowserMarketWindow,
  BrowserTickRun,
} from './market.ts'
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
import type { BrowserAccountPatch } from '../projection/accountPatch.ts'

// 16: resume (`resume_from_revision`, `stream_id`, `account_resumed`).
// 17: compact frames (networking items 19 and 21): no frame over 64 KiB
// (larger messages come as `message_part` frames, messageParts.ts), deltas
// as patches (`account_patch`, `account_resumed.patches`,
// lib/projection/accountPatch.ts) and prices as ticks (`market_ticks`,
// `window.ticks`, marketTicks.ts). The gateway still serves 15 and 16 tabs.
export const BROWSER_PROTOCOL_VERSION = 17

// Where this tab's copy of an account stands: the stream its snapshot came
// from and the revision it applied up to. The gateway resumes only inside
// that stream; anything else gets a snapshot.
export interface BrowserResumePoint {
  stream_id: Uuid
  projection_revision: ProjectionRevision
}

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
  | {
      kind: 'subscribe_account'
      request_id: Uuid
      account_id: Uuid
      resume_from_revision?: BrowserResumePoint
    }
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
      // The stream this snapshot starts (absent from older gateways).
      stream_id?: Uuid
      snapshot: BrowserAccountSnapshot
    }
  | {
      // The answer to a resuming subscribe: the deltas after the tab's
      // revision, in order (none when it was current). Applied all or none.
      kind: 'account_resumed'
      request_id: Uuid
      subscription_id: Uuid
      route: AccountRouteKey
      stream_id: Uuid
      // Protocol 16; empty for 17, which sends `patches`.
      deltas: BrowserAccountDelta[]
      patches?: BrowserAccountPatch[]
    }
  | {
      kind: 'account_delta'
      subscription_id: Uuid
      route: AccountRouteKey
      delta: BrowserAccountDelta
    }
  | {
      // Protocol 17's account_delta: a patch against the window one
      // revision back.
      kind: 'account_patch'
      subscription_id: Uuid
      route: AccountRouteKey
      patch: BrowserAccountPatch
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
      // Protocol 17's market_samples; read as market_samples (marketTicks.ts).
      kind: 'market_ticks'
      subscription_id: Uuid
      account_id: Uuid
      symbol: string
      ticks: BrowserTickRun[]
    }
  | {
      kind: 'market_error'
      request_id: Uuid | null
      subscription_id: Uuid | null
      account_id: Uuid
      error: BrowserMarketError
    }
  | {
      kind: 'market_feed_unavailable'
      subscription_id: Uuid
      account_id: Uuid
      symbol: string
      reason: string
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
