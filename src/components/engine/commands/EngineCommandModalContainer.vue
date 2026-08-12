<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

import { storeToRefs } from 'pinia'

import { useModalStore } from '@/stores/modals'
import ChaseCommandModal from './ChaseCommandModal.vue'
import CancelEntryWorkModal from './CancelEntryWorkModal.vue'
import FlattenCommandModal from './FlattenCommandModal.vue'
import OrderCommandModal from './OrderCommandModal.vue'
import TrailingEntryCommandModal from './TrailingEntryCommandModal.vue'

const modals = useModalStore()
const { modalStack, openModals } = storeToRefs(modals)

watch(
  () => modalStack.value.length,
  (depth) => {
    document.body.classList.toggle('no-scroll', depth > 0)
  },
  { immediate: true },
)

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || modalStack.value.length === 0) return
  event.preventDefault()
  event.stopImmediatePropagation()
  modals.closeTopModal()
}

document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  document.body.classList.remove('no-scroll')
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <OrderCommandModal
    :open="openModals.EngineMarketOrder ?? false"
    execution-kind="market"
    @close="modals.closeModal('EngineMarketOrder')"
  />
  <OrderCommandModal
    :open="openModals.EngineLimitOrder ?? false"
    execution-kind="limit"
    @close="modals.closeModal('EngineLimitOrder')"
  />
  <ChaseCommandModal
    :open="openModals.EngineChaseOrder ?? false"
    @close="modals.closeModal('EngineChaseOrder')"
  />
  <TrailingEntryCommandModal
    :open="openModals.EngineTrailingEntry ?? false"
    @close="modals.closeModal('EngineTrailingEntry')"
  />
  <FlattenCommandModal
    :open="openModals.EngineFlatten ?? false"
    @close="modals.closeModal('EngineFlatten')"
  />
  <CancelEntryWorkModal
    :open="openModals.EngineCancelEntryWork ?? false"
    @close="modals.closeModal('EngineCancelEntryWork')"
  />
</template>
