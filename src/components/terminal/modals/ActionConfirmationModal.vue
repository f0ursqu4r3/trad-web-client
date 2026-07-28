<script setup lang="ts">
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
  }>(),
  {
    open: false,
    confirmLabel: 'Confirm',
  },
)

defineEmits<{
  (event: 'cancel'): void
  (event: 'confirm'): void
}>()
</script>

<template>
  <BaseCommandModal :title="title" :open="open" @close="$emit('cancel')">
    <p class="m-0 whitespace-pre-line text-[13px] leading-5">{{ message }}</p>
    <template #footer>
      <button type="button" class="btn btn-secondary" @click="$emit('cancel')">Cancel</button>
      <button type="button" class="btn btn-primary" @click="$emit('confirm')">
        {{ confirmLabel }}
      </button>
    </template>
  </BaseCommandModal>
</template>
