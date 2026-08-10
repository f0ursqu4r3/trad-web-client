<script setup lang="ts">
import SplitView from '@/components/general/SplitView.vue'
import ProjectionCommandList from './ProjectionCommandList.vue'
import ProjectionEntityTree from './ProjectionEntityTree.vue'
import ReconciliationControl from './ReconciliationControl.vue'
</script>

<template>
  <SplitView orientation="vertical" storage-key="engine-terminal-orders-column">
    <template #commands>
      <section class="panel-section">
        <header class="panel-header">
          <span class="panel-title">Commands</span>
          <ReconciliationControl />
        </header>
        <ProjectionCommandList />
      </section>
    </template>
    <template #entities>
      <section class="panel-section">
        <header class="panel-header"><span class="panel-title">Execution Graph</span></header>
        <ProjectionEntityTree />
      </section>
    </template>
  </SplitView>
</template>

<style scoped>
.panel-section {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}
</style>
