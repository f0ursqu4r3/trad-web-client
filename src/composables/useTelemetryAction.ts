import { ref, watch, type WatchSource } from 'vue'

import { newActionAttemptId, recordTelemetry, type TelemetryActionKind } from '@/lib/telemetry'

interface TelemetryActionOptions {
  open: WatchSource<boolean>
  accountId: () => string | null
  actionKind: () => TelemetryActionKind
  source: string
  tradeId?: () => string | null
  commandId?: () => string | null
}

export function useTelemetryAction(options: TelemetryActionOptions) {
  const actionAttemptId = ref<string | null>(null)
  const submitted = ref(false)

  watch(
    options.open,
    (open, wasOpen) => {
      if (open && !wasOpen) begin()
      if (!open && wasOpen) abandon()
    },
    { immediate: true },
  )

  function begin(): string {
    actionAttemptId.value = newActionAttemptId()
    submitted.value = false
    emit('action_opened')
    emit('form_opened')
    return actionAttemptId.value
  }

  function confirm(): string {
    if (actionAttemptId.value === null || submitted.value) begin()
    emit('action_confirmed')
    submitted.value = true
    return actionAttemptId.value ?? begin()
  }

  function validationFailed(reasonCode = 'client_validation'): void {
    if (actionAttemptId.value === null) begin()
    emit('validation_failed', { reason_code: reasonCode })
  }

  function cancel(): void {
    if (actionAttemptId.value !== null && !submitted.value) emit('action_canceled')
    actionAttemptId.value = null
    submitted.value = false
  }

  function abandon(): void {
    if (actionAttemptId.value !== null && !submitted.value) emit('action_abandoned')
    actionAttemptId.value = null
    submitted.value = false
  }

  function emit(
    eventName:
      | 'action_opened'
      | 'form_opened'
      | 'action_confirmed'
      | 'validation_failed'
      | 'action_canceled'
      | 'action_abandoned',
    properties: { reason_code?: string } = {},
  ): void {
    recordTelemetry({
      eventName,
      accountId: options.accountId(),
      tradeId: options.tradeId?.(),
      commandId: options.commandId?.(),
      actionAttemptId: actionAttemptId.value,
      properties: {
        action_kind: options.actionKind(),
        source: options.source,
        ...properties,
      },
    })
  }

  return { actionAttemptId, confirm, validationFailed, cancel, abandon }
}
