<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="panel-card mb-4 overflow-hidden">
    <header class="panel-header-row min-h-9">
      <div>
        <span class="text-primary">{{ title }}</span
        ><span v-if="description" class="ml-2 normal-case tracking-normal dim">{{
          description
        }}</span>
      </div>
      <slot name="actions" />
    </header>
    <div class="p-4"><slot /></div>
  </section>
</template>
