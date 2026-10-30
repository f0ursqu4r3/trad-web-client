import type { AccountCommandReadiness } from '../gateway/accountCommandReadiness.ts'
import type { TelemetryBlockerCode } from '../telemetry/catalog.ts'
import { readinessBlocker } from '../telemetry/readinessBlocker.ts'

// What holds the order ticket's submit, and its telemetry code. Every case
// the ticket shows has its own code: a submit while the market picker was
// open (2026-10-29 07:05:44, switching BTC to TAO) or while a Chase draft
// was incomplete or already submitting (07:06:19) was UNCLASSIFIED_BLOCKER.

export type TicketPreviewStatus = 'idle' | 'planning' | 'ready' | 'rejected'

export interface TradeTicketGateInput {
  accountId: string
  marketPending: boolean
  // The message buildTradeTicketIntent threw, or null when the draft builds.
  draftError: string | null
  gatewayConnected: boolean
  accountReadiness: AccountCommandReadiness
  previewStatus: TicketPreviewStatus
  previewReady: boolean
}

export interface TradeTicketGate {
  message: string
  blocker: TelemetryBlockerCode
}

export function tradeTicketGate(input: TradeTicketGateInput): TradeTicketGate | null {
  if (input.accountId === '') {
    return { message: 'Select a trading account.', blocker: 'ACCOUNT_NOT_HYDRATED' }
  }
  if (input.marketPending) {
    return {
      message: 'Pick a market from the list or press Enter to select it.',
      blocker: 'MARKET_SELECTION_PENDING',
    }
  }
  if (input.draftError !== null) return { message: input.draftError, blocker: 'FORM_INVALID' }
  if (!input.gatewayConnected) {
    return { message: 'Waiting for the Trad gateway.', blocker: 'TRANSPORT_OFFLINE' }
  }
  if (!input.accountReadiness.ready) {
    return {
      message: input.accountReadiness.reason ?? 'The account is not ready for new trades.',
      blocker: readinessBlocker(input.accountReadiness.code),
    }
  }
  if (input.previewStatus === 'rejected') return null
  if (!input.previewReady) {
    return {
      message: 'Waiting for the authoritative execution preview.',
      blocker: 'PREVIEW_PENDING',
    }
  }
  return null
}

export interface TicketSubmitState {
  submitting: boolean
  planningIntentReady: boolean
  previewStatus: TicketPreviewStatus
}

// Why a submit did not go out: the gate, then what canSubmit adds to it.
export function tradeTicketBlocker(
  gate: TradeTicketGate | null,
  state: TicketSubmitState,
): TelemetryBlockerCode {
  if (gate !== null) return gate.blocker
  if (state.submitting) return 'SUBMISSION_IN_FLIGHT'
  if (!state.planningIntentReady) return 'FORM_INVALID'
  if (state.previewStatus === 'rejected') return 'COMMAND_REJECTED'
  return 'UNCLASSIFIED_BLOCKER'
}
