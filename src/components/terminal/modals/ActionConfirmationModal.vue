<script setup lang="ts">
import { ref } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    alternateLabel?: string | null
    rememberLabel?: string | null
    danger?: boolean
    alternateDanger?: boolean
  }>(),
  {
    open: false,
    confirmLabel: 'Confirm',
    alternateLabel: null,
    rememberLabel: null,
    danger: false,
    alternateDanger: false,
  },
)

defineEmits<{
  (event: 'cancel'): void
  (event: 'confirm', remember: boolean): void
  (event: 'alternate'): void
}>()

const remember = ref(false)
</script>

<template>
  <BaseCommandModal :title="title" :open="open" @close="$emit('cancel')">
    <p class="m-0 whitespace-pre-line text-[13px] leading-5">{{ message }}</p>
    <label v-if="props.rememberLabel" class="mt-4 flex items-center gap-2 text-[12px]">
      <input v-model="remember" type="checkbox" class="checkbox" />
      <span>{{ props.rememberLabel }}</span>
    </label>
    <template #footer>
      <button type="button" class="btn btn-secondary" @click="$emit('cancel')">Cancel</button>
      <button
        v-if="props.alternateLabel"
        type="button"
        class="btn"
        :class="props.alternateDanger ? 'btn-danger' : 'btn-secondary'"
        @click="$emit('alternate')"
      >
        {{ props.alternateLabel }}
      </button>
      <button
        type="button"
        class="btn"
        :class="props.danger ? 'btn-danger' : 'btn-primary'"
        @click="$emit('confirm', remember)"
      >
        {{ confirmLabel }}
      </button>
    </template>
  </BaseCommandModal>
</template>
