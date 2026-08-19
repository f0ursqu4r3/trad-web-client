<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="control-section panel-card mb-4 overflow-hidden">
    <header class="control-section-header">
      <div class="min-w-0">
        <div class="control-section-title">{{ title }}</div>
        <div v-if="description" class="control-section-description">{{ description }}</div>
      </div>
    </header>
    <div v-if="$slots.actions" class="control-section-toolbar"><slot name="actions" /></div>
    <div class="control-section-body"><slot /></div>
  </section>
</template>
