import { ref } from 'vue'

import type { EngineCommandSubmission } from '@/lib/engineCommands/form'
import { CommandOutcomeUnknownError, useGatewayStore } from '@/stores/gateway'

export function useEngineCommandSubmission() {
  const gateway = useGatewayStore()
  const submitting = ref(false)
  const submissionError = ref<string | null>(null)
  const unknownRequests = ref<Record<string, string>>({})

  async function submit(
    submission: EngineCommandSubmission,
    actionAttemptId?: string | null,
  ): Promise<boolean> {
    const unknownRequestId = unknownRequests.value[submission.accountId]
    if (unknownRequestId !== undefined) {
      submissionError.value = `Command #${unknownRequestId.slice(0, 8)} has an unknown outcome. Wait for its authoritative projection before submitting again.`
      return false
    }
    submissionError.value = null
    submitting.value = true
    try {
      const outcome = await gateway.submitCommand(
        submission.intent,
        submission.accountId,
        undefined,
        actionAttemptId ?? undefined,
      )
      if (outcome.kind === 'rejected') {
        submissionError.value = outcome.rejection.reason
        return false
      }
      return true
    } catch (error) {
      if (error instanceof CommandOutcomeUnknownError) {
        unknownRequests.value = {
          ...unknownRequests.value,
          [submission.accountId]: error.requestId,
        }
      }
      submissionError.value =
        error instanceof CommandOutcomeUnknownError
          ? `${error.message}. Do not resubmit until the account projection or exchange state proves the outcome.`
          : error instanceof Error
            ? error.message
            : String(error)
      return false
    } finally {
      submitting.value = false
    }
  }

  function clearSubmissionError(): void {
    submissionError.value = null
  }

  function clearUnknownOutcome(accountId: string, requestId: string): void {
    if (unknownRequests.value[accountId] !== requestId) return
    const remaining = { ...unknownRequests.value }
    delete remaining[accountId]
    unknownRequests.value = remaining
  }

  return {
    submitting,
    submissionError,
    unknownRequests,
    submit,
    clearSubmissionError,
    clearUnknownOutcome,
  }
}
