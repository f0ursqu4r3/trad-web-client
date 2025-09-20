<script setup lang="ts">
// Placeholder chart panel; later integrate real-time price chart
</script>

<template>
  <section class="panel chart-panel">
    <header class="panel-header">Chart</header>
    <div class="chart-placeholder">Price chart placeholder</div>
  </section>
</template>

<style scoped>
.chart-panel { position: relative; display: flex; flex-direction: column; }
.chart-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--color-text-dim); }
</style>
