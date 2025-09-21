<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTerminalStore } from '@/stores/terminal'

const store = useTerminalStore()
const { devices, selectedDeviceId } = storeToRefs(store)

function select(id: string) {
  store.selectDevice(id)
  store.pushLog(`Tree selected ${id}`)
}
</script>

<template>
  <section class="order-tree-panel">
    <ul class="tree">
      <li
        v-for="d in devices"
        :key="d.id"
        :class="['node', d.id === selectedDeviceId ? 'active' : '']"
        @click="select(d.id)"
      >
        <span class="label">{{ d.id.slice(0, 4) }}</span>
        <span class="status">{{ d.status }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.order-tree-panel {
  display: flex;
  flex-direction: column;
}
.tree {
  list-style: none;
  margin: 0;
  padding: 4px 6px;
  font-family: var(--font-mono);
  font-size: 12px;
}
.node {
  padding: 2px 4px;
  border-radius: 3px;
  display: flex;
  justify-content: space-between;
}
.node.active {
  background: #233041;
  outline: 1px solid var(--accent-color);
}
.node:hover {
  background: #1f2730;
  cursor: pointer;
}
.label {
  font-weight: 600;
}
.status {
  opacity: 0.6;
}
</style>
