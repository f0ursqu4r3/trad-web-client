<template>
  <div class="w-full h-full scroll-area">
    <tree-view v-model:expanded-ids="expanded" :items="data" :indent="12" inline-toggle>
      <template #default="{ item, isLeaf, toggle, expanded }">
        <div
          class="flex items-center gap-2 px-2 border-slate-800/60 text-[13px] hover:bg-white/5 select-none cursor-default"
          @dblclick="!isLeaf && toggle()"
          @click="!isLeaf && toggle()"
        >
          <span class="inline-flex w-4 shrink-0 items-center justify-center text-term-dim">
            <FolderOpenIcon v-if="!isLeaf && expanded" />
            <FolderIcon v-else-if="!isLeaf" />
            <FileIcon v-else />
          </span>
          <span class="truncate">{{ item.name || item.id }}</span>
        </div>
      </template>
    </tree-view>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { TreeView, type TreeItem } from '@/components/general/TreeView'

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
