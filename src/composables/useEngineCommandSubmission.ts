import { ref } from 'vue'

import type { EngineCommandSubmission } from '@/lib/engineCommands/form'
import { CommandOutcomeUnknownError, useGatewayStore } from '@/stores/gateway'

export function useEngineCommandSubmission() {
  const gateway = useGatewayStore()
  const submitting = ref(false)
  const submissionError = ref<string | null>(null)

  async function submit(submission: EngineCommandSubmission): Promise<boolean> {
    submissionError.value = null
    submitting.value = true
    try {
      const outcome = await gateway.submitCommand(submission.intent, submission.accountId)
      if (outcome.kind === 'rejected') {
        submissionError.value = outcome.rejection.reason
        return false
      }
      return true
    } catch (error) {
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

  return { submitting, submissionError, submit, clearSubmissionError }
}
