<template>
  <div class="w-full h-full scroll-area">
    <div v-if="!treeData.length" class="empty-state">Select a command to view its device tree.</div>
    <tree-view v-else v-model:expanded-ids="expanded" :items="treeData" :indent="12" inline-toggle>
      <template #default="{ item, isLeaf, toggle, expanded: isExpanded }">
        <div
          class="flex items-center gap-2 px-2 border-slate-800/60 text-[13px] hover:bg-white/5 select-none cursor-default"
        >
          <span
            @dblclick="!isLeaf && toggle()"
            @click="!isLeaf && toggle()"
            class="inline-flex w-4 shrink-0 items-center justify-center text-term-dim"
          >
            <FolderOpenIcon v-if="!isLeaf && isExpanded" />
            <FolderIcon v-else-if="!isLeaf" />
            <FileIcon v-else />
          </span>
          <div class="node-label">
            <span class="node-name">{{ item.kind || item.id }}</span>
            <span v-if="item.symbol" class="node-meta">{{ item.symbol }}</span>
            <span v-if="item.state" class="node-state">{{ item.state }}</span>
          </div>
        </div>
      </template>
    </tree-view>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { TreeView, type TreeItem } from '@/components/general/TreeView'
import { FolderIcon, FolderOpenIcon, FileIcon } from '@/components/icons'
import { useDeviceStore, type Device } from '@/stores/devices'

const deviceStore = useDeviceStore()

const { devices } = storeToRefs(deviceStore)

const expanded = ref<(string | number)[]>([])

const treeData = computed<TreeItem[]>(() =>
  (devices.value as Device[]).map((item) => ({
    id: item.id,
    children: [],
    kind: item.kind,
  })),
)
</script>

<style scoped>
.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem;
  color: var(--term-dim, #8b98a5);
  font-size: 0.875rem;
}

.node-label {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.node-name {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-meta {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--term-dim, #8b98a5);
}

.node-state {
  flex-shrink: 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--term-dim, #8b98a5);
}
</style>
