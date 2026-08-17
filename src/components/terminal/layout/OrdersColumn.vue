<script setup lang="ts">
import { ref } from 'vue'
import { Filter, ListChecks, WalletCards } from 'lucide-vue-next'

import AccountPositionInspector from '@/components/engine/AccountPositionInspector.vue'
import ExternalOrderInspector from '@/components/engine/ExternalOrderInspector.vue'
import ReconciliationControl from '@/components/engine/ReconciliationControl.vue'
import SplitView from '@/components/general/SplitView.vue'
import ProjectionCommandPanel from '@/components/terminal/projection/ProjectionCommandPanel.vue'
import ProjectionTreePanel from '@/components/terminal/projection/ProjectionTreePanel.vue'

const commandPanel = ref<InstanceType<typeof ProjectionCommandPanel> | null>(null)
const positionsOpen = ref(false)
const externalOrdersOpen = ref(false)
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
              class="btn btn-sm btn-ghost compact-icon"
              title="Inspect external orders"
              aria-label="Inspect external orders"
              @click="externalOrdersOpen = true"
            >
              <ListChecks :size="12" />
            </button>
            <button
              class="btn btn-sm btn-ghost compact-icon"
              title="Inspect account positions"
              aria-label="Inspect account positions"
              @click="positionsOpen = true"
            >
              <WalletCards :size="12" />
            </button>
            <ReconciliationControl />
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
        <div class="panel-header"><span class="panel-title">Devices</span></div>
        <ProjectionTreePanel />
      </div>
    </template>
  </SplitView>
  <AccountPositionInspector :open="positionsOpen" @close="positionsOpen = false" />
  <ExternalOrderInspector :open="externalOrdersOpen" @close="externalOrdersOpen = false" />
</template>

<style scoped>
.panel {
  border-radius: var(--radius-panel);
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.compact-icon {
  align-items: center;
  display: inline-flex;
  height: 22px;
  justify-content: center;
  padding: 0;
  width: 22px;
}
</style>
