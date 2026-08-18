<script setup lang="ts">
defineProps<{ eyebrow: string; title: string; description: string }>()
</script>

<template>
  <header class="mb-5 border-b border-[var(--border-subtle)] pb-4">
    <div class="mb-1 text-[10px] uppercase tracking-[.11em] text-[var(--accent-color)]">
      {{ eyebrow }}
    </div>
    <h1 class="m-0 text-xl font-medium text-[var(--fg-strong)]">{{ title }}</h1>
    <p class="mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--fg-muted)]">
      {{ description }}
    </p>
  </header>
</template>
