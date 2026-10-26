<script setup lang="ts">
import { computed } from 'vue'
import { methodLegend } from './performance-2026-10'
import type { Method } from './reportFormat'

const props = defineProps<{ method: Method }>()
const entry = computed(() => methodLegend.find((item) => item.method === props.method)!)
</script>

<template>
  <span class="method-tag" :class="method" :title="entry.label">{{ entry.tag }}</span>
</template>

<style scoped>
.method-tag {
  display: inline-block;
  min-width: 3.4rem;
  padding: 0.08rem 0.3rem;
  border: 1px solid var(--border-normal);
  color: var(--fg-muted);
  font-size: 9px;
  line-height: 1.4;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  white-space: nowrap;
}
.method-tag.production {
  border-color: color-mix(in srgb, var(--state-success) 38%, var(--border-normal));
  color: var(--state-success);
}
.method-tag.estimate {
  border-color: color-mix(in srgb, var(--state-warning) 42%, var(--border-normal));
  color: var(--state-warning);
}
</style>
