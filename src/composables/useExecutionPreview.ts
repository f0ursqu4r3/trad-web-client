import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

import type {
  BrowserPreviewIntent,
  BrowserPreviewOutcome,
  BrowserPreviewRejection,
  CommandPreview,
} from '@/lib/gateway'
import {
  PREVIEW_EDITING_SETTLE_MS,
  editingGuidance,
  isEditingBarrier,
} from '@/lib/engineCommands/previewPresentation'
import { newActionAttemptId, recordTelemetry } from '@/lib/telemetry'
import { useGatewayStore } from '@/stores/gateway'

const REQUEST_DEBOUNCE_MS = 350

export type ExecutionPreviewStatus = 'idle' | 'planning' | 'ready' | 'rejected'

interface ExecutionPreviewOptions {
  accountId: () => string
  intent: () => BrowserPreviewIntent | null
  active: () => boolean
  actionAttemptId: () => string | null | undefined
  editing: Ref<boolean>
}

export function useExecutionPreview(options: ExecutionPreviewOptions) {
  const gateway = useGatewayStore()
  const preview = ref<CommandPreview | null>(null)
  const rejection = ref<BrowserPreviewRejection | null>(null)
  const transportError = ref<string | null>(null)
  const pending = ref(false)
  const guidanceActive = ref(false)
  let timer: number | null = null
  let rejectionTimer: number | null = null
  let blurTimer: number | null = null
  let generation = 0
  const fallbackActionAttemptId = newActionAttemptId()
  let deferredRejection: DeferredRejection | null = null

  const guidance = computed(() => {
    const current = rejection.value
    return current !== null && guidanceActive.value
      ? editingGuidance(current.reason_code)
      : null
  })
  const error = computed(() => {
    if (transportError.value !== null) return transportError.value
    return guidance.value === null ? rejection.value?.reason ?? null : null
  })
  const ready = computed(
    () => preview.value !== null && error.value === null && guidance.value === null && !pending.value,
  )
  const status = computed<ExecutionPreviewStatus>(() => {
    if (pending.value || guidance.value !== null) return 'planning'
    if (error.value !== null) return 'rejected'
    if (preview.value !== null) return 'ready'
    return 'idle'
  })

  watch(
    [options.active, options.accountId, options.intent, () => gateway.isConnected],
    schedule,
    { deep: true, immediate: true },
  )
  watch(options.editing, (editing) => {
    if (blurTimer !== null) window.clearTimeout(blurTimer)
    blurTimer = null
    if (!editing) {
      blurTimer = window.setTimeout(() => {
        blurTimer = null
        presentDeferredRejection()
      }, 0)
    }
  })

  function schedule(): void {
    if (timer !== null) window.clearTimeout(timer)
    supersedeDeferredRejection('draft_changed')
    const current = ++generation
    preview.value = null
    rejection.value = null
    transportError.value = null
    pending.value = false
    if (!options.active() || options.accountId() === '' || options.intent() === null) return
    if (!gateway.isConnected) return
    timer = window.setTimeout(() => void request(current), REQUEST_DEBOUNCE_MS)
  }

  async function request(current: number): Promise<void> {
    timer = null
    const intent = options.intent()
    if (current !== generation || intent === null) return
    const requestId = crypto.randomUUID()
    const accountId = options.accountId()
    const actionAttemptId = options.actionAttemptId() ?? fallbackActionAttemptId
    pending.value = true
    try {
      const outcome = await gateway.previewCommand(
        intent,
        accountId,
        requestId,
        actionAttemptId,
      )
      if (current !== generation) {
        recordOutcome(
          'preview_superseded',
          outcome,
          { accountId, actionAttemptId, requestId },
          'draft_changed',
        )
        return
      }
      if (outcome.kind === 'ready') {
        preview.value = outcome.preview
        recordOutcome(
          'preview_ready',
          outcome,
          { accountId, actionAttemptId, requestId },
          'ready',
        )
      } else {
        rejection.value = outcome.rejection
        const context = { accountId, actionAttemptId, requestId }
        const reasonCode = outcome.rejection.reason_code ?? outcome.rejection.code
        if (options.editing.value && isEditingBarrier(outcome.rejection.reason_code)) {
          deferredRejection = { context, outcome, reasonCode }
          guidanceActive.value = true
          recordOutcome('preview_guidance', outcome, context, reasonCode)
          rejectionTimer = window.setTimeout(
            presentDeferredRejection,
            PREVIEW_EDITING_SETTLE_MS,
          )
        } else {
          recordOutcome('preview_rejected', outcome, context, reasonCode)
        }
      }
    } catch (reason) {
      if (current === generation) {
        transportError.value = reason instanceof Error ? reason.message : String(reason)
      }
    } finally {
      if (current === generation) pending.value = false
    }
  }

  function presentDeferredRejection(): void {
    const deferred = takeDeferredRejection()
    if (deferred === null) return
    recordOutcome('preview_rejected', deferred.outcome, deferred.context, deferred.reasonCode)
  }

  function supersedeDeferredRejection(reason: string): void {
    const deferred = takeDeferredRejection()
    if (deferred === null) return
    recordOutcome('preview_superseded', deferred.outcome, deferred.context, reason)
  }

  function takeDeferredRejection(): DeferredRejection | null {
    if (rejectionTimer !== null) window.clearTimeout(rejectionTimer)
    if (blurTimer !== null) window.clearTimeout(blurTimer)
    rejectionTimer = null
    blurTimer = null
    const deferred = deferredRejection
    deferredRejection = null
    guidanceActive.value = false
    return deferred
  }

  function recordOutcome(
    eventName: 'preview_ready' | 'preview_rejected' | 'preview_guidance' | 'preview_superseded',
    outcome: BrowserPreviewOutcome,
    context: { accountId: string; actionAttemptId: string; requestId: string },
    reasonCode: string,
  ): void {
    recordTelemetry({
      eventName,
      accountId: context.accountId,
      actionAttemptId: context.actionAttemptId,
      requestId: context.requestId,
      properties: {
        outcome_code: outcome.kind,
        reason_code: reasonCode,
      },
    })
  }

  onBeforeUnmount(() => {
    generation += 1
    if (timer !== null) window.clearTimeout(timer)
    supersedeDeferredRejection('component_unmounted')
  })

  return { error, guidance, pending, preview, ready, rejection, status }
}

interface DeferredRejection {
  context: { accountId: string; actionAttemptId: string; requestId: string }
  outcome: Extract<BrowserPreviewOutcome, { kind: 'rejected' }>
  reasonCode: string
}
