import { computed, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import type {
  HyperliquidPositionEffectPreviewRequest,
  Uuid,
} from '@/lib/ws/protocol'
import { useWsStore } from '@/stores/ws'

export function useHyperliquidPositionEffectPreview(
  request: ComputedRef<HyperliquidPositionEffectPreviewRequest | null>,
  enabled: ComputedRef<boolean>,
) {
  const ws = useWsStore()
  const latestRequestId = ref<Uuid | null>(null)
  const pending = ref(false)
  const confirmedFingerprint = ref<string | null>(null)
  let timer: number | null = null

  const fingerprint = computed(() => (request.value ? JSON.stringify(request.value) : null))
  const preview = computed(() =>
    latestRequestId.value
      ? (ws.hyperliquidPositionEffectPreviews[latestRequestId.value] ?? null)
      : null,
  )
  const error = computed(() =>
    latestRequestId.value
      ? (ws.hyperliquidPositionEffectErrors[latestRequestId.value] ?? null)
      : null,
  )
  const requiresConfirmation = computed(
    () => preview.value?.requires_new_confirmation === true,
  )
  const confirmationFingerprint = computed(() => {
    if (!fingerprint.value || !preview.value) return null
    return JSON.stringify({
      request: fingerprint.value,
      observed_at: preview.value.observed_at,
      current_signed_quantity: preview.value.current_signed_quantity,
      expected_signed_quantity: preview.value.expected_signed_quantity,
      effect: preview.value.effect,
      affected_owner_count: preview.value.affected_owner_count,
    })
  })
  const confirmed = computed(
    () =>
      !requiresConfirmation.value ||
      (confirmationFingerprint.value !== null &&
        confirmedFingerprint.value === confirmationFingerprint.value),
  )
  const canSubmit = computed(
    () =>
      !enabled.value ||
      (preview.value !== null &&
        !pending.value &&
        !preview.value.blocked_reason &&
        confirmed.value),
  )

  function clearTimer() {
    if (timer === null) return
    window.clearTimeout(timer)
    timer = null
  }

  function requestPreview() {
    clearTimer()
    confirmedFingerprint.value = null
    latestRequestId.value = null
    pending.value = false
    if (!enabled.value || !request.value) return
    timer = window.setTimeout(() => {
      if (!request.value || !enabled.value) return
      pending.value = true
      latestRequestId.value = ws.requestHyperliquidPositionEffectPreview(request.value)
      timer = null
    }, 250)
  }

  function setConfirmed(value: boolean) {
    confirmedFingerprint.value = value ? confirmationFingerprint.value : null
  }

  watch([enabled, fingerprint], requestPreview, { immediate: true })
  watch([preview, error], () => {
    if (preview.value || error.value) pending.value = false
  })
  onUnmounted(clearTimer)

  return {
    preview,
    error,
    pending,
    requiresConfirmation,
    confirmed,
    canSubmit,
    setConfirmed,
  }
}
