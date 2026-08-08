<script setup lang="ts">
import { useProjectionUiStore } from '@/stores/projectionUi'
import ProjectionTreeNode from './ProjectionTreeNode.vue'

const ui = useProjectionUiStore()
</script>

<template>
  <div class="entity-tree" data-testid="projection-entity-tree">
    <ProjectionTreeNode v-if="ui.selectedTree" :tree="ui.selectedTree" />
    <div v-else class="empty-state">Select a command</div>
  </div>
</template>

<style scoped>
.entity-tree {
  height: 100%;
  overflow: auto;
}

.empty-state {
  padding: 14px;
  color: var(--color-text-dim);
  text-align: center;
}
</style>
