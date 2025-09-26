<script setup lang="ts">
import { ref } from 'vue'
import TreeView, { type TreeItem } from '@/components/general/TreeView.vue'

const data = ref<TreeItem[]>([
  {
    id: 'src',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'components',
        name: 'components',
        type: 'folder',
        children: [
          { id: 'TreeView.vue', name: 'TreeView.vue', type: 'file' },
          { id: 'SplitView.vue', name: 'SplitView.vue', type: 'file' },
        ],
      },
      { id: 'main.ts', name: 'main.ts', type: 'file' },
    ],
  },
  { id: 'README.md', name: 'README.md', type: 'file' },
])

const expanded = ref<(string | number)[]>(['src', 'components'])

function iconFor(item: TreeItem, isLeaf: boolean) {
  if (isLeaf) return '📄'
  return '📁'
}
</script>

<template>
  <section class="tree-demo">
    <header class="hdr">
      <h2>TreeView Demo</h2>
      <div class="hint">Route: /tree</div>
    </header>
    <tree-view v-model:expanded-ids="expanded" :items="data" :indent="18">
      <template #toggle-icon="{ expanded }">
        <span class="twisty">{{ expanded ? '▼' : '▶' }}</span>
      </template>

      <template #default="{ item, isLeaf, toggle }">
        <div class="row" @dblclick="!isLeaf && toggle()">
          <span class="ico">{{ iconFor(item, isLeaf) }}</span>
          <span class="name">{{ item.name || item.id }}</span>
        </div>
      </template>
    </tree-view>
  </section>
</template>

<style scoped>
.tree-demo {
  max-width: 520px;
  padding: 16px;
  margin: 0 auto;
}
.hdr {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.hint {
  opacity: 0.7;
  font-size: 0.9em;
}
.row {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.ico {
  width: 1.2em;
  text-align: center;
}
.twisty {
  font-size: 0.85em;
}
</style>
