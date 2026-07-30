<script setup lang="ts">
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useWsStore } from '@/stores/ws'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const ws = useWsStore()

function submit() {
  ws.sendCancelAllDevices()
  emit('close')
}
</script>

<template>
  <BaseCommandModal title="Cancel All Entry Work" :open="open" @close="emit('close')">
    <div class="space-y-3 text-[12px]">
      <p class="m-0">Stop every active entry-producing device across your trading accounts.</p>
      <div class="border border-[var(--border-color)] p-3">
        <div>Trailing Entries that have not established exposure will be canceled.</div>
        <div>Resting Limit and Chase entry remainders will be canceled.</div>
        <div>Established positions will remain open and protected.</div>
        <div>Native TP/SL, Stop Guards, and reduce-only closes will be preserved.</div>
      </div>
      <p class="m-0 text-[var(--color-warning)]">
        This does not flatten positions. Use Flatten Position to close Hyperliquid exposure.
      </p>
    </div>
    <template #footer>
      <button type="button" class="btn btn-secondary btn-sm" @click="emit('close')">Back</button>
      <button type="button" class="btn btn-primary btn-sm" @click="submit">
        Cancel All Entry Work
      </button>
    </template>
  </BaseCommandModal>
</template>
