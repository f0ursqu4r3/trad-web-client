<script setup lang="ts">
import { ref } from 'vue'
import { WalletCards } from 'lucide-vue-next'

import SplitView from '@/components/general/SplitView.vue'
import AccountPositionInspector from './AccountPositionInspector.vue'
import ActiveProtectionList from './ActiveProtectionList.vue'
import ProjectionCommandList from './ProjectionCommandList.vue'
import ProjectionEntityTree from './ProjectionEntityTree.vue'
import ReconciliationControl from './ReconciliationControl.vue'

const positionsOpen = ref(false)
</script>

<template>
  <SplitView orientation="vertical" storage-key="engine-terminal-orders-column">
    <template #commands>
      <section class="panel-section">
        <header class="panel-header">
          <span class="panel-title">Commands</span>
          <span class="account-controls">
            <button
              class="btn btn-xs btn-neutral position-button"
              type="button"
              title="Inspect account positions"
              aria-label="Inspect account positions"
              @click="positionsOpen = true"
            >
              <WalletCards :size="12" />
            </button>
            <ReconciliationControl />
          </span>
        </header>
        <ActiveProtectionList />
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
  <AccountPositionInspector :open="positionsOpen" @close="positionsOpen = false" />
</template>

<style scoped>
.panel-section {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.account-controls {
  display: inline-flex;
  margin-left: auto;
  align-items: center;
  gap: 7px;
}

.position-button {
  width: 22px;
  height: 20px;
  justify-content: center;
  padding: 0;
}
</style>
