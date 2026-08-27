import { newActionAttemptId, recordTelemetry, type TelemetryActionKind } from './index.ts'

export async function observeAccountAction<T>(
  actionKind: TelemetryActionKind,
  accountId: string | null,
  request: () => Promise<T>,
): Promise<T> {
  const actionAttemptId = newActionAttemptId()
  recordTelemetry({
    eventName: actionKind === 'rotate_agent' ? 'agent_rotation_started' : 'action_submitted',
    accountId,
    actionAttemptId,
    properties: { action_kind: actionKind, source: 'account_settings' },
  })
  try {
    const result = await request()
    recordTelemetry({
      eventName: 'action_accepted',
      accountId,
      actionAttemptId,
      properties: { action_kind: actionKind, outcome_code: 'accepted' },
    })
    return result
  } catch (error) {
    recordTelemetry({
      eventName: 'action_rejected',
      accountId,
      actionAttemptId,
      properties: {
        action_kind: actionKind,
        blocker_code: 'COMMAND_REJECTED',
        outcome_code: 'http_rejected',
      },
    })
    throw error
  }
}
