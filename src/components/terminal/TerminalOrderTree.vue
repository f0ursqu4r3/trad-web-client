<script setup lang="ts">
// Placeholder order tree; will represent device execution tree
import { reactive } from 'vue'

interface Node {
  id: string
  label: string
  status: 'done' | 'pending' | 'not-sent'
}
const nodes = reactive<Node[]>([
  { id: 'te', label: 'TE', status: 'done' },
  { id: 'sg', label: 'SG', status: 'done' },
  { id: 'split', label: 'Split', status: 'done' },
  { id: 'mo1', label: 'MO', status: 'not-sent' },
])
</script>

<template>
  <section class="panel order-tree-panel">
    <header class="panel-header">Order Tree</header>
    <ul class="tree">
      <li v-for="n in nodes" :key="n.id" :class="['node', n.status]">
        <span class="label">{{ n.label }}</span>
        <span class="status">{{ n.status }}</span>
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
.node.done {
  background: rgba(100, 200, 100, 0.08);
}
.node.pending {
  background: rgba(200, 200, 100, 0.08);
}
.node.not-sent {
  background: rgba(200, 100, 100, 0.08);
}
.label {
  font-weight: 600;
}
.status {
  opacity: 0.6;
}
</style>
