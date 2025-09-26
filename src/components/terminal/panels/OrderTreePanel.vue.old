<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTerminalStore } from '@/stores/terminal'
import { useUiStore } from '@/stores/ui'
import type { DagNode } from '@/components/general/DagViewer.vue'

import DagViewer from '@/components/general/DagViewer.vue'

const store = useTerminalStore()
const theme = useUiStore()

const { selectedDeviceId } = storeToRefs(store)

const themeVars = computed(() => ({
  bg: theme.getVar('color-bg-secondary'),
  ink: theme.getVar('color-text'),
  chipBg: theme.getVar('color-bg-tertiary'),
  done: theme.getVar('color-success'),
  pending: theme.getVar('color-error'),
  lineStrong: theme.getVar('color-border-strong'),
}))

function select(device: DagNode) {
  store.selectDevice(device.id)
  store.pushLog(`Tree selected ${device.id}`)
}
</script>

<template>
  <section class="order-tree-panel">
    <dag-viewer
      class="tree"
      node-key="id"
      :theme-vars="themeVars"
      :selected-node-id="selectedDeviceId"
      @node-click="select"
    >
      <template #node="{ node, isSelected }">
        <div :class="['node', { active: isSelected }]">
          <span class="label">{{ node.name || node.id }}</span>
          <span class="status">{{ node.status }}</span>
        </div>
      </template>
    </dag-viewer>
  </section>
</template>

<style scoped>
.order-tree-panel {
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
