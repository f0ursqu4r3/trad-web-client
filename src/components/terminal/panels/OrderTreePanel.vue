<template>
  <div class="w-full h-full scroll-area">
    <tree-view v-model:expanded-ids="expanded" :items="data" :indent="18">
      <template #toggle-icon="{ expanded }">
        <span class="inline-flex w-4 shrink-0 items-center justify-center text-term-dim">
          <FolderOpenIcon v-if="expanded" />
          <FolderIcon v-else />
        </span>
      </template>

      <template #default="{ item, isLeaf, toggle }">
        <div
          class="inline-flex items-center gap-2 px-2 py-1.5 border-b border-slate-800/60 text-[13px] hover:bg-white/5 select-none cursor-pointer"
          @dblclick="!isLeaf && toggle()"
        >
          <FileIcon v-if="isLeaf" />
          <span class="name truncate">{{ item.name || item.id }}</span>
        </div>
      </template>
    </tree-view>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import TreeView from '@/components/general/TreeView.vue'
import type { TreeItem } from '@/components/general/TreeView.vue'

import { FolderIcon, FolderOpenIcon, FileIcon } from '@/components/icons'

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
</script>
