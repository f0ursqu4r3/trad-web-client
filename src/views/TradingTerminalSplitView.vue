<template>
  <SplitView orientation="horizontal" storage-key="trading-terminal-split">
    <template #right>
      <div class="pane">left-panel</div>
    </template>

    <template #left>
      <div class="pane">right-panel</div>
    </template>
  </SplitView>
</template>

<script setup lang="ts">
import SplitView from '@/components/general/SplitView.vue'
</script>
