import type { AbandonedTransfer } from './messageParts.ts'

// What the gateway store does when a message in parts lost a part
// (messageParts.ts): the account subscription it belonged to subscribes
// again (resuming when it can), a history request fails retryably, and
// anything else (an unsubscribed subscription, a reply nobody waits for) is
// left alone.

export type TransferRecovery =
  | { kind: 'resubscribe'; accountId: string; subscriptionId: string; requestId: string | null }
  | { kind: 'fail_history'; requestId: string }
  | { kind: 'ignore' }

export const LOST_HISTORY_REASON = 'the history page was lost in transit; try again'

export function transferRecovery(
  lost: AbandonedTransfer,
  subscriptionRequests: ReadonlyMap<string, { accountId: string }>,
  subscriptionAccounts: ReadonlyMap<string, string>,
  pendingHistories: ReadonlyMap<string, unknown>,
): TransferRecovery {
  const { requestId, subscriptionId } = lost
  const request = requestId === null ? undefined : subscriptionRequests.get(requestId)
  const accountId =
    request?.accountId ??
    (subscriptionId === null ? undefined : subscriptionAccounts.get(subscriptionId))
  if (accountId !== undefined && subscriptionId !== null) {
    return {
      kind: 'resubscribe',
      accountId,
      subscriptionId,
      requestId: request === undefined ? null : requestId,
    }
  }
  if (requestId !== null && pendingHistories.has(requestId)) {
    return { kind: 'fail_history', requestId }
  }
  return { kind: 'ignore' }
}
