import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SplitPreviewData, Uuid } from '@/lib/ws/protocol'

export const useSplitPreviewStore = defineStore('splitPreview', () => {
  const previews = ref<Record<Uuid, SplitPreviewData>>({})

  function setPreview(preview: SplitPreviewData) {
    previews.value[preview.request_uuid] = preview
  }

  function getPreview(requestId: Uuid): SplitPreviewData | null {
    return previews.value[requestId] ?? null
  }

  function clearPreview(requestId: Uuid) {
    if (requestId in previews.value) {
      delete previews.value[requestId]
    }
  }

  return {
    setPreview,
    getPreview,
    clearPreview,
  }
})
