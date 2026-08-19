<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    open?: boolean
  }>(),
  { open: false },
)
</script>

<template>
  <details class="evidence-disclosure" :open="open">
    <summary>{{ title }}</summary>
    <div class="evidence-body">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.evidence-disclosure {
  border-bottom: 1px solid var(--border-color);
  padding: 0 12px 8px;
}

summary {
  cursor: pointer;
  color: var(--color-text-dim);
  font-size: 11px;
  padding: 8px 0 5px;
  text-transform: uppercase;
}

.evidence-body {
  color: var(--color-text);
  font-size: 11px;
}
</style>
