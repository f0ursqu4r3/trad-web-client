<script setup lang="ts">
import { XIcon } from '@/components/icons'
withDefaults(
  defineProps<{
    title: string
    open: boolean
  }>(),
  { open: false },
)
const emit = defineEmits<{ (e: 'close'): void }>()
function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center p-16 z-500"
      @click.self="close"
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
            <button class="btn btn-ghost" @click="close">
              <XIcon />
            </button>
          </div>
        </header>

        <div class="px-4 pt-3 pb-4 overflow-auto text-[13px]">
          <slot />
        </div>

        <footer class="flex gap-2 justify-end px-4 pt-2 pb-3 border-t border-[var(--border-color)]">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
