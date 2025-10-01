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
    id: 'b81d2d99-98a4-40d7-9b2f-204f412548e9',
    name: 'src',
    type: 'folder',
    children: [
      {
        id: 'cbf291da-dd36-4589-a2f4-ea04ad42da4d',
        name: 'components',
        type: 'folder',
        children: [
          { id: 'fd720d64-8832-4f6c-871d-d81a1ae6bd73', name: 'TreeView.vue', type: 'file' },
          { id: 'a0c6b61c-ad0c-4639-b903-244ffcfa2579', name: 'SplitView.vue', type: 'file' },
        ],
      },
      { id: '13166576-cbff-4c48-bdc4-6932f30b8969', name: 'main.ts', type: 'file' },
    ],
  },
  { id: 'd64e4999-f989-49e1-a03f-8bbc1c879f1f', name: 'README.md', type: 'file' },
])

const expanded = ref<(string | number)[]>(['src', 'components'])
</script>
