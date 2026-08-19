<script setup lang="ts">
defineProps<{
  title: string
  description: string
}>()
</script>

<template>
  <div class="panel-empty-state">
    <div class="panel-empty-content">
      <span class="panel-empty-icon" aria-hidden="true"><slot name="icon" /></span>
      <strong>{{ title }}</strong>
      <span>{{ description }}</span>
      <div v-if="$slots.action" class="panel-empty-action"><slot name="action" /></div>
    </div>
  </div>
</template>

<style scoped>
.panel-empty-state {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
  padding: 1.5rem;
  background:
    linear-gradient(color-mix(in srgb, var(--border-subtle) 18%, transparent) 1px, transparent 1px),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--border-subtle) 18%, transparent) 1px,
      transparent 1px
    );
  background-size: 28px 28px;
}
.panel-empty-content {
  display: flex;
  max-width: 29rem;
  align-items: center;
  flex-direction: column;
  gap: 0.45rem;
  padding: 1rem;
  color: var(--fg-muted);
  text-align: center;
}
.panel-empty-content strong {
  color: var(--fg-strong);
  font-size: 13px;
  font-weight: 500;
}
.panel-empty-content > span:not(.panel-empty-icon) {
  font-size: 12px;
  line-height: 1.5;
}
.panel-empty-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--fg-muted);
}
.panel-empty-action {
  margin-top: 0.45rem;
}
</style>
