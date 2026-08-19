<script setup lang="ts">
import { computed, ref } from 'vue'
import { Filter, ListChecks, WalletCards } from 'lucide-vue-next'

import AccountPositionInspector from '@/components/engine/AccountPositionInspector.vue'
import ExternalOrderInspector from '@/components/engine/ExternalOrderInspector.vue'
import ReconciliationControl from '@/components/engine/ReconciliationControl.vue'
import EngineCommandPalette from '@/components/engine/commands/EngineCommandPalette.vue'
import SplitView from '@/components/general/SplitView.vue'
import ProjectionCommandPanel from '@/components/terminal/projection/ProjectionCommandPanel.vue'
import ProjectionTreePanel from '@/components/terminal/projection/ProjectionTreePanel.vue'
import { useAccountProjectionStore } from '@/stores/accountProjection'

const commandPanel = ref<InstanceType<typeof ProjectionCommandPanel> | null>(null)
const positionsOpen = ref(false)
const externalOrdersOpen = ref(false)
const projections = useAccountProjectionStore()
const externalFlattenCount = computed(
  () =>
    projections.selectedLive?.positions.filter(
      (position) => position.latest_external_flatten !== null,
    ).length ?? 0,
)
</script>

<template>
  <SplitView orientation="vertical" storage-key="terminal-orders-column-projection">
    <template #command-history>
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title command-heading">
            <span>Commands</span><EngineCommandPalette compact />
          </span>
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
              class="btn btn-sm btn-ghost compact-icon position-button"
              :title="
                externalFlattenCount > 0
                  ? `${externalFlattenCount} externally flattened position changes`
                  : 'Inspect account positions'
              "
              aria-label="Inspect account positions"
              @click="positionsOpen = true"
            >
              <WalletCards :size="12" />
              <span
                v-if="externalFlattenCount > 0"
                class="activity-count"
                data-testid="external-flatten-count"
                >{{ externalFlattenCount }}</span
              >
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
.command-heading {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.command-heading :deep(.btn) {
  min-height: 24px;
  padding: 2px 6px;
}

.compact-icon {
  align-items: center;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  padding: 0;
  width: 28px;
}

.position-button {
  position: relative;
}

.activity-count {
  position: absolute;
  top: -7px;
  right: -7px;
  min-width: 14px;
  padding: 1px 3px;
  border-radius: 8px;
  background: var(--color-warning, #d68b2c);
  color: #111;
  font-size: 11px;
  line-height: 12px;
}
</style>
