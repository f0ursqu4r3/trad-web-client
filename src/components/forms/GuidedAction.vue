<script setup lang="ts">
import { ArrowDown } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    active: boolean
    label?: string
  }>(),
  { label: 'Click to continue' },
)
</script>

<template>
  <div class="guided-action" :class="{ 'guided-action--active': active }">
    <span v-if="active" class="guided-action__cue" aria-hidden="true">
      <span>{{ label }}</span>
      <ArrowDown :size="14" />
    </span>
    <slot />
  </div>
</template>

<style scoped>
.guided-action {
  display: inline-flex;
  align-items: center;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.2rem;
}

.guided-action__cue {
  display: inline-flex;
  align-items: center;
  flex-direction: column;
  gap: 0.05rem;
  color: var(--state-warning);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  animation: guided-nudge 1.25s ease-in-out infinite;
}

.guided-action--active :deep(.btn) {
  position: relative;
  border-color: var(--state-warning);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--state-warning) 38%, transparent);
  animation: guided-click 1.8s ease-out infinite;
}

@keyframes guided-nudge {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(3px);
  }
}

@keyframes guided-click {
  0%,
  42% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--state-warning) 38%, transparent);
  }
  62% {
    box-shadow: 0 0 0 5px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .guided-action__cue,
  .guided-action--active :deep(.btn) {
    animation: none;
  }
}
</style>
