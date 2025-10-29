<template>
  <div class="w-full h-full scroll-area p-2">
    <div
      v-if="!treeData.length"
      class="h-full flex items-center justify-center text-(--color-text-dim) text-center text-xs"
    >
      Select a command to view its device tree.
    </div>
    <tree-view v-else v-model:expanded-ids="expanded" :items="treeData" :indent="12" inline-toggle>
      <template #default="{ item, isLeaf, toggle, expanded: isExpanded }">
        <div
          class="flex items-center gap-2 px-2 border-slate-800/60 text-[13px] hover:bg-white/5 select-none cursor-default w-full rounded-lg"
          :class="item.id == selectedDeviceId ? 'ring-2 ring-(--accent-color)' : ''"
        >
          <span
            @dblclick="!isLeaf && toggle()"
            @click="!isLeaf && toggle()"
            class="inline-flex w-4 shrink-0 items-center justify-center text-term-dim"
          >
            <FolderOpenIcon v-if="!isLeaf && isExpanded" />
            <FolderIcon v-else-if="!isLeaf" />
            <ArrowTrendingDownIcon v-else />
          </span>
          <div
            class="flex items-center gap-2 justify-between w-full min-w-0 cursor-pointer"
            @click="store.inspectDevice(item.id as string)"
          >
            <div class="flex flex-wrap gap-x-2 items-center">
              <span class="wrap-none">{{ item.label || item.id }}</span>
              <span v-if="item.symbol" class="pill pill-xs">
                {{ item.symbol }}
              </span>
            </div>
            <span v-if="item.lifecycle" class="text-(--color-text-dim) uppercase text-xs">
              {{ item.lifecycle }}
            </span>
          </div>
        </div>
      </template>
    </tree-view>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { formatName } from '@/lib/utils'
import { TreeView, type TreeItem } from '@/components/general/TreeView'
import { FolderIcon, FolderOpenIcon, ArrowTrendingDownIcon } from '@/components/icons'
import { useDeviceStore, type Device, type TrailingEntry } from '@/stores/devices'

const store = useDeviceStore()

const props = withDefaults(
  defineProps<{
    expanded?: boolean
  }>(),
  {
    expanded: false,
  },
)

const { devices, selectedDeviceId } = storeToRefs(store)

const expanded = ref<(string | number)[]>(props.expanded ? devices.value.map((d) => d.id) : [])

const treeData = computed<TreeItem[]>(() => {
  const list = devices.value as Device[]
  const nodes = new Map<string, TreeItem>()
  const roots: TreeItem[] = []

  // First pass: create all nodes
  for (const device of list) {
    nodes.set(device.id, {
      id: device.id,
      children: [],
      label: formatName(device.kind),
      symbol: device.state.symbol,
      lifecycle: (device.state as TrailingEntry)?.lifecycle || '',
    })
  }

  // Second pass: wire up parent/children by parent_device
  for (const device of list) {
    const node = nodes.get(device.id)!
    const parentId = device.parent_device
    if (parentId && nodes.has(parentId)) {
      const parent = nodes.get(parentId)!
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
})
</script>
