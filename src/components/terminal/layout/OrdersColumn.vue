<template>
  <SplitView
    orientation="vertical"
    storage-key="terminal-orders-column"
    :initial-sizes="[35, 35, 30]"
  >
    <template #inbound-debug>
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Messages</span>
          <span class="panel-options">
            <span class="text-xs dim">{{ inboundPanelRef?.totalCount }}</span>
            <button
              class="btn btn-sm btn-ghost"
              :disabled="!inboundPanelRef?.messageCount"
              @click="inboundPanelRef?.clearMessages()"
            >
              Clear
            </button>
          </span>
        </div>
        <InboundDebugPanel ref="inboundPanelRef" />
      </div>
    </template>
    <template #command-history>
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Commands</span>
          <span class="panel-options">
            <span v-if="commandPanelRef?.hiddenCommandCount" class="text-xs">
              {{ commandPanelRef.hiddenCommandCount }} hidden
            </span>
            <button class="btn btn-sm btn-ghost" @click="commandPanelRef?.toggleFilters()">
              <Filter :size="12" />
            </button>
          </span>
        </div>
        <CommandPanel ref="commandPanelRef" />
      </div>
    </template>
    <template #device-tree>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Devices</span></div>
        <DeviceTreePanel />
      </div>
    </template>
  </SplitView>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Filter } from 'lucide-vue-next'
import SplitView from '@/components/general/SplitView.vue'
import InboundDebugPanel from '@/components/terminal/panels/InboundDebugPanel.vue'
import CommandPanel from '@/components/terminal/panels/CommandPanel.vue'
import DeviceTreePanel from '../panels/DeviceTreePanel.vue'

const commandPanelRef = ref<InstanceType<typeof CommandPanel> | null>(null)
const inboundPanelRef = ref<InstanceType<typeof InboundDebugPanel> | null>(null)
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  border-radius: var(--radius-panel);
}
</style>
