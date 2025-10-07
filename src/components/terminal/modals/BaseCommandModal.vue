<script setup lang="ts">
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
    <div v-if="open" class="modal-frame" @click.self="close">
      <div class="modal-card" role="dialog" aria-modal="true">
        <header class="modal-header">
          <div class="flex items-center justify-between w-full">
            <span>{{ title }}</span>
            <button class="btn btn-secondary btn-xs" @click="close">Close</button>
          </div>
        </header>
        <div class="modal-body">
          <slot />
        </div>
        <footer class="modal-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-frame {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 4rem 1rem 2rem;
  z-index: 500;
}
.modal-card {
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  width: min(640px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.modal-header {
  font-size: 13px;
  font-weight: 600;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-color);
  display: flex;
}
.modal-body {
  padding: 0.75rem 1rem 1rem;
  overflow: auto;
  font-size: 13px;
}
.modal-footer {
  padding: 0.5rem 1rem 0.75rem;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  border-top: 1px solid var(--border-color);
}
</style>
