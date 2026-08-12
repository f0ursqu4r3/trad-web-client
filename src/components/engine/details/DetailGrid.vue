<script setup lang="ts">
import type { DetailRow } from './model'

defineProps<{
  title?: string
  rows: DetailRow[]
}>()
</script>

<template>
  <section v-if="rows.length" class="detail-section">
    <h3 v-if="title">{{ title }}</h3>
    <dl class="detail-grid">
      <div v-for="item in rows" :key="item.label" class="detail-cell">
        <dt>{{ item.label }}</dt>
        <dd :data-tone="item.tone ?? 'normal'">{{ item.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.detail-section {
  border-bottom: 1px solid var(--border-color);
}

.detail-section > h3 {
  border-bottom: 1px solid var(--border-color);
  color: var(--color-text-dim);
  font-size: 11px;
  font-weight: normal;
  margin: 0 12px;
  padding: 9px 0 5px;
  text-transform: uppercase;
}

.detail-grid {
  display: grid;
  gap: 0 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  padding: 0 12px 8px;
}

.detail-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 7px 0 0;
}

dt {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--color-text);
}

dd[data-tone='warning'] {
  color: var(--color-warning);
}

dd[data-tone='danger'] {
  color: var(--color-error);
}

dd[data-tone='success'] {
  color: var(--color-success);
}
</style>
