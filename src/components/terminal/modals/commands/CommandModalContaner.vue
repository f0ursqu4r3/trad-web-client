<script setup lang="ts">
import { useModalStore } from '@/stores/modals'
import { storeToRefs } from 'pinia'

import MarketOrderModal from '@/components/terminal/modals/commands/MarketOrderModal.vue'
import LimitOrderModal from '@/components/terminal/modals/commands/LimitOrderModal.vue'
import TrailingEntryOrderModal from '@/components/terminal/modals/commands/TrailingEntryOrderModal.vue'
import SplitMarketOrderModal from '@/components/terminal/modals/commands/SplitMarketOrderModal.vue'
import { watch, onBeforeUnmount } from 'vue'

const store = useModalStore()

const { openModals, modalStack } = storeToRefs(store)
const closeModal = store.closeModal

const closeTopModal = () => store.closeTopModal()

// named handler so the same reference can be removed later
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.stopImmediatePropagation()
    e.preventDefault()
    closeTopModal()
  }
}

// react to stack depth instead of array identity so pushes/pops are observed
watch(
  () => modalStack.value.length,
  (depth) => {
    if (depth > 0) {
      document.body.classList.add('no-scroll')
      document.addEventListener('keydown', onKeyDown)
    } else {
      document.body.classList.remove('no-scroll')
      document.removeEventListener('keydown', onKeyDown)
    }
  },
  { immediate: true },
)

// ensure cleanup on unmount
onBeforeUnmount(() => {
  document.body.classList.remove('no-scroll')
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <MarketOrderModal :open="openModals['MarketOrder']" @close="closeModal('MarketOrder')" />
    <LimitOrderModal :open="openModals['LimitOrder']" @close="closeModal('LimitOrder')" />
    <TrailingEntryOrderModal
      :open="openModals['TrailingEntryOrder']"
      @close="closeModal('TrailingEntryOrder')"
    />
    <SplitMarketOrderModal
      :open="openModals['SplitMarketOrder']"
      @close="closeModal('SplitMarketOrder')"
    />
  </Teleport>
</template>
