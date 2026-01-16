<template>
  <SplitView v-if="showInbound" orientation="vertical" storage-key="terminal-orders-column">
    <template #inbound-debug>
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Messages</span>
          <span class="panel-options">
            <span class="text-xs dim">{{ inboundPanelRef?.totalCount }}</span>
            <button class="btn btn-sm btn-ghost" @click="toggleInboundDebug">
              {{ inboundDebugEnabled ? 'Debug on' : 'Debug off' }}
            </button>
            <button class="btn btn-sm btn-ghost" @click="toggleInboundPanel">Hide</button>
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
            <span class="text-xs">
              {{ commandPanelRef?.shownCommandCount ?? 0 }} shown
            </span>
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
  <SplitView v-else orientation="vertical" storage-key="terminal-orders-column-compact">
    <template #command-history>
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Commands</span>
          <span class="panel-options">
            <span class="text-xs">
              {{ commandPanelRef?.shownCommandCount ?? 0 }} shown
            </span>
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
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Filter } from 'lucide-vue-next'
import SplitView from '@/components/general/SplitView.vue'
import InboundDebugPanel from '@/components/terminal/panels/InboundDebugPanel.vue'
import CommandPanel from '@/components/terminal/panels/CommandPanel.vue'
import DeviceTreePanel from '../panels/DeviceTreePanel.vue'
import { useWsStore } from '@/stores/ws'
import { useUiStore } from '@/stores/ui'

const commandPanelRef = ref<InstanceType<typeof CommandPanel> | null>(null)
const inboundPanelRef = ref<InstanceType<typeof InboundDebugPanel> | null>(null)
const wsStore = useWsStore()
const uiStore = useUiStore()
const { inboundDebugEnabled } = storeToRefs(wsStore)
const { showInboundPanel: showInbound } = storeToRefs(uiStore)

function toggleInboundPanel() {
  uiStore.toggleInboundPanel()
}

function toggleInboundDebug() {
  wsStore.setInboundDebugEnabled?.(!inboundDebugEnabled.value)
}

watch(
  showInbound,
  (visible) => {
    wsStore.setInboundDebugEnabled?.(visible)
  },
  { immediate: true },
)
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
