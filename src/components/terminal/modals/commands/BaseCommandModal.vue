<script setup lang="ts">
import { X } from 'lucide-vue-next'
const props = withDefaults(
  defineProps<{
    title: string
    open: boolean
    size?: 'default' | 'wide'
  }>(),
  { open: false, size: 'default' },
)
const titleId = `command-modal-title-${props.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
const emit = defineEmits<{ (e: 'close'): void }>()
function close() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 bg-black/25 backdrop-blur-xs flex items-start justify-center p-16 z-500"
      @click.self="close"
    >
      <div
        class="command-modal bg-[var(--panel-bg)] border border-[var(--border-color)] rounded-[10px] w-full max-h-[80vh] flex flex-col text-[var(--color-text)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        :class="`command-modal-${size}`"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
      >
        <header
          class="flex items-center px-4 py-3 border-b border-[var(--border-color)] uppercase tracking-[0.5px] text-[var(--accent-color)] text-[13px] font-semibold"
        >
          <div class="flex items-center justify-between w-full">
            <span :id="titleId">{{ title }}</span>
            <button class="btn btn-ghost" @click="close">
              <X :size="12" />
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

<style scoped>
.command-modal-default {
  max-width: 640px;
}
.command-modal-wide {
  max-width: 920px;
}
</style>
