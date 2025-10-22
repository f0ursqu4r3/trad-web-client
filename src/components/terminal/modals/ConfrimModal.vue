<script setup lang="ts">
import { ref } from 'vue'
withDefaults(
  defineProps<{
    title: string
    message: string
    confirmButtonText?: string
    cancelButtonText?: string
  }>(),
  {
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    confirmButtonText: 'Confirm',
    cancelButtonText: 'Cancel',
  },
)
defineEmits<{ (e: 'cancel'): void; (e: 'confirm'): void }>()

const open = ref(false)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 bg-black/25 backdrop-blur-xs flex items-start justify-center p-16 z-500"
    >
      <div
        class="bg-[var(--panel-bg)] border border-[var(--border-color)] rounded-[10px] w-full max-w-[640px] max-h-[80vh] flex flex-col text-[var(--color-text)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
      >
        <header
          class="flex items-center px-4 py-3 border-b border-[var(--border-color)] uppercase tracking-[0.5px] text-[var(--accent-color)] text-[13px] font-semibold"
        >
          <div class="flex items-center justify-between w-full">
            <span>{{ title }}</span>
          </div>
        </header>

        <div class="px-4 pt-3 pb-4 overflow-auto text-[13px]">
          {{ message }}
        </div>

        <footer class="flex gap-2 justify-end px-4 pt-2 pb-3 border-t border-[var(--border-color)]">
          <button class="btn btn-ghost" @click="$emit('cancel')">{{ cancelButtonText }}</button>
          <button class="btn btn-primary" @click="$emit('confirm')">{{ confirmButtonText }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
