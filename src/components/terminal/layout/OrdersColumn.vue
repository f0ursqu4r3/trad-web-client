<script setup lang="ts">
import { ref } from 'vue'
import { Filter } from 'lucide-vue-next'

import SplitView from '@/components/general/SplitView.vue'
import ProjectionCommandPanel from '@/components/terminal/projection/ProjectionCommandPanel.vue'
import ProjectionTreePanel from '@/components/terminal/projection/ProjectionTreePanel.vue'

const commandPanel = ref<InstanceType<typeof ProjectionCommandPanel> | null>(null)
</script>

<template>
  <SplitView orientation="vertical" storage-key="terminal-orders-column-projection">
    <template #command-history>
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Commands</span>
          <span class="panel-options">
            <span class="text-xs">{{ commandPanel?.shownCommandCount ?? 0 }} shown</span>
            <span v-if="commandPanel?.hiddenCommandCount" class="text-xs">
              {{ commandPanel.hiddenCommandCount }} hidden
            </span>
            <button
              class="btn btn-sm btn-ghost"
              title="Command filters"
              @click="commandPanel?.toggleFilters()"
            >
              <Filter :size="12" />
            </button>
          </span>
        </div>
        <ProjectionCommandPanel ref="commandPanel" />
      </div>
    </template>
    <template #device-tree>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Execution</span></div>
        <ProjectionTreePanel />
      </div>
    </template>
  </SplitView>
</template>

<style scoped>
.panel {
  border-radius: var(--radius-panel);
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}
</style>
