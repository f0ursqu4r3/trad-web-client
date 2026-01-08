<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { formatName } from '@/lib/utils'
import { TreeView, type TreeItem } from '@/components/general/TreeView'
import { Folder, FolderOpen, TrendingDown } from 'lucide-vue-next'
import { useDeviceStore, type Device, type TrailingEntryState } from '@/stores/devices'
import { MarketAction } from '@/lib/ws/protocol'

const store = useDeviceStore()

const { devices, selectedDeviceId } = storeToRefs(store)

// Start fully expanded by default: track only collapsed ids
const collapsed = ref<(string | number)[]>([])

const treeData = computed<TreeItem[]>(() => {
  const list = devices.value as Device[]
  const nodes = new Map<string, TreeItem>()
  const roots: TreeItem[] = []

  const splitIntent = (device: Device): string | null => {
    if (!device.children_devices?.length) return null
    const actions = new Set<string>()
    device.children_devices.forEach((childId) => {
      const child = list.find((d) => d.id === childId)
      if (child?.kind === 'MarketOrder') {
        const action = (child.state as any).market_action
        if (action) actions.add(action)
      }
    })
    if (actions.size === 0) return null
    if (actions.size === 1) {
      const action = Array.from(actions)[0]
      return action === MarketAction.Close ? 'Close' : 'Open'
    }
    return 'Mixed'
  }

  const statusLabel = (device: Device): string => {
    if (device.failed) return 'Failed'
    if (device.canceled) return 'Canceled'
    if (device.complete) return 'Completed'
    if (device.awaiting_children) return 'Waiting'
    return 'Running'
  }

  // First pass: create all nodes
  for (const device of list) {
    const teLifecycle =
      device.kind === 'TrailingEntry' ? (device.state as TrailingEntryState)?.lifecycle || '' : ''
    const intent =
      device.kind === 'MarketOrder'
        ? ((device.state as any).market_action as string)
        : device.kind === 'Split'
          ? splitIntent(device)
          : null
    nodes.set(device.id, {
      id: device.id,
      children: [],
      label: formatName(device.kind),
      symbol: device.state.symbol,
      lifecycle: device.complete || device.failed || device.canceled ? '' : teLifecycle,
      status: statusLabel(device),
      intent,
      created_at: device.created_at,
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

  const intentRank = (intent?: string | null): number => {
    if (!intent) return 99
    if (intent === 'Open') return 0
    if (intent === 'Mixed') return 1
    if (intent === 'Close') return 2
    return 50
  }

  const sortNodes = (items: TreeItem[]) => {
    items.sort((a, b) => {
      const aTime = a.created_at instanceof Date ? a.created_at.getTime() : 0
      const bTime = b.created_at instanceof Date ? b.created_at.getTime() : 0
      if (aTime !== bTime) return aTime - bTime
      const intentDelta = intentRank(a.intent as string) - intentRank(b.intent as string)
      if (intentDelta !== 0) return intentDelta
      const labelA = (a.label || '').toString()
      const labelB = (b.label || '').toString()
      if (labelA !== labelB) return labelA.localeCompare(labelB)
      return a.id.toString().localeCompare(b.id.toString())
    })
    items.forEach((item) => {
      if (item.children?.length) sortNodes(item.children)
    })
  }

  sortNodes(roots)

  return roots
})

const rowClass = (item: TreeItem): string => {
  switch (item.status) {
    case 'Failed':
      return 'device-row-failed'
    case 'Canceled':
      return 'device-row-canceled'
    case 'Completed':
      return 'device-row-complete'
    case 'Waiting':
      return 'device-row-waiting'
    default:
      return 'device-row-active'
  }
}
</script>

<template>
  <div class="w-full h-full scroll-area p-2">
    <div
      v-if="!treeData.length"
      class="h-full flex items-center justify-center text-(--color-text-dim) text-center text-xs"
    >
      Select a command to view its device tree.
    </div>
    <tree-view
      v-else
      v-model:collapsed-ids="collapsed"
      :items="treeData"
      :indent="24"
      inline-toggle
    >
      <template #default="{ item, isLeaf, toggle, expanded: isExpanded }">
        <div
          class="flex items-center gap-2 border-slate-800/60 text-[13px] hover:bg-white/5 select-none cursor-default w-full device-row"
          :class="[
            rowClass(item),
            item.id == selectedDeviceId ? 'ring-2 ring-[var(--color-text)]' : '',
          ]"
        >
          <span
            @dblclick="!isLeaf && toggle()"
            @click="!isLeaf && toggle()"
            class="inline-flex w-4 shrink-0 items-center justify-center text-term-dim"
          >
            <FolderOpen v-if="!isLeaf && isExpanded" :size="12" />
            <Folder v-else-if="!isLeaf" :size="12" />
            <TrendingDown v-else :size="12" />
          </span>
          <div
            class="flex items-center gap-2 justify-between w-full min-w-0 cursor-pointer"
            @click="store.inspectDevice(item.id as string)"
          >
            <div class="flex flex-wrap gap-x-2 items-center">
              <span class="wrap-none">{{ item.label || item.id }}</span>
              <span v-if="item.intent" class="pill pill-xs">
                {{ item.intent }}
              </span>
              <!-- <span v-if="item.symbol" class="pill pill-xs">
                {{ item.symbol }}
              </span> -->
            </div>
            <span v-if="item.lifecycle" class="text-(--color-text-dim) uppercase text-xs">
              {{ formatName(item.lifecycle) }}
            </span>
            <span v-else-if="item.status" class="text-(--color-text-dim) uppercase text-xs">
              {{ item.status }}
            </span>
          </div>
        </div>
      </template>
    </tree-view>
  </div>
</template>

<style scoped>
.device-row {
  width: 100%;
  padding: 0 0.5rem 0 calc(var(--tree-indent, 0px) + 0.5rem);
}

.device-row-failed {
  background-color: color-mix(in srgb, var(--color-error) 14%, transparent);
}
.device-row-canceled {
  background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
}
.device-row-complete {
  background-color: color-mix(in srgb, var(--color-success) 12%, transparent);
}
.device-row-waiting {
  background-color: color-mix(in srgb, var(--color-info) 12%, transparent);
}
.device-row-active {
  background-color: color-mix(in srgb, var(--color-warning) 12%, transparent);
}
</style>
