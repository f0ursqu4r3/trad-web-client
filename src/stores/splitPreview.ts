import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SplitPreviewData, Uuid } from '@/lib/ws/protocol'

export const useSplitPreviewStore = defineStore('splitPreview', () => {
  const previews = ref<Record<Uuid, SplitPreviewData>>({})
  const errors = ref<Record<Uuid, string>>({})

  function setPreview(preview: SplitPreviewData) {
    previews.value[preview.request_uuid] = preview
    delete errors.value[preview.request_uuid]
  }

  function getPreview(requestId: Uuid): SplitPreviewData | null {
    return previews.value[requestId] ?? null
  }

  function setError(requestId: Uuid, error: string) {
    errors.value[requestId] = error
    delete previews.value[requestId]
  }

  function getError(requestId: Uuid): string | null {
    return errors.value[requestId] ?? null
  }

  function clearPreview(requestId: Uuid) {
    if (requestId in previews.value) {
      delete previews.value[requestId]
    }
    if (requestId in errors.value) {
      delete errors.value[requestId]
    }
  }

  return {
    setPreview,
    getPreview,
    setError,
    getError,
    clearPreview,
  }
})
