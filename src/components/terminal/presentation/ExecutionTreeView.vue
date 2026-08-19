<script setup lang="ts">
import { ref } from 'vue'
import { Folder, FolderOpen, Network, TrendingDown } from 'lucide-vue-next'

import { TreeView, type TreeItem } from '@/components/general/TreeView'
import PanelEmptyState from '@/components/general/PanelEmptyState.vue'
import { formatName } from '@/lib/utils'

export interface ExecutionTreeBadge {
  label: string
  tone?: 'dim' | 'info' | 'success' | 'warning' | 'error'
}

export interface ExecutionTreeItem extends TreeItem {
  id: string
  kind?: string
  label: string
  status: string
  lifecycle?: string | null
  intent?: string | null
  throttled?: boolean
  symbol?: string | null
  market?: {
    exchange?: string | null
    product?: string | null
    account?: string | null
    network?: string | null
  } | null
  protection?: { text: string; className: string } | null
  badges?: ExecutionTreeBadge[]
  tone?: ExecutionTreeBadge['tone']
  blockedReason?: string | null
  children?: ExecutionTreeItem[]
}

defineProps<{
  items: ExecutionTreeItem[]
  selectedId: string | null
  emptyText: string
}>()

const emit = defineEmits<{
  select: [id: string]
  context: [id: string, x: number, y: number]
}>()

const collapsed = ref<(string | number)[]>([])

function rowClass(item: ExecutionTreeItem): string {
  switch (item.status) {
    case 'Failed':
      return 'device-row-failed'
    case 'Blocked':
      return 'device-row-blocked'
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

function blockedReasonLabel(reason: string): string {
  const normalized = reason.toLowerCase()
  if (normalized.includes('instrument rules') && normalized.includes('stale')) {
    return 'Stale instrument rules'
  }
  return 'Preparation blocked'
}

function openContext(item: ExecutionTreeItem, event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  emit('context', item.id, event.clientX, event.clientY)
}
</script>

<template>
  <PanelEmptyState v-if="!items.length" title="Nothing selected" :description="emptyText">
    <template #icon><Network :size="20" /></template>
  </PanelEmptyState>
  <TreeView v-else v-model:collapsed-ids="collapsed" :items="items" :indent="24" inline-toggle>
    <template #default="{ item: rawItem, isLeaf, toggle, expanded }">
      <div
        class="flex items-center gap-2 border-slate-800/60 text-[13px] hover:bg-white/5 select-none cursor-default w-full device-row"
        :class="[
          rowClass(rawItem as ExecutionTreeItem),
          rawItem.id === selectedId ? 'ring-2 ring-[var(--color-text)]' : '',
        ]"
        :data-node-id="rawItem.id"
        :data-node-kind="(rawItem as ExecutionTreeItem).kind"
        @contextmenu="openContext(rawItem as ExecutionTreeItem, $event)"
      >
        <span
          class="inline-flex w-4 shrink-0 items-center justify-center text-term-dim"
          @dblclick="!isLeaf && toggle()"
          @click="!isLeaf && toggle()"
        >
          <FolderOpen v-if="!isLeaf && expanded" :size="12" />
          <Folder v-else-if="!isLeaf" :size="12" />
          <TrendingDown v-else :size="12" />
        </span>
        <div
          class="flex items-center gap-2 justify-between w-full min-w-0 cursor-pointer"
          @click="emit('select', rawItem.id as string)"
        >
          <div class="flex flex-wrap gap-x-2 items-center">
            <span class="wrap-none">{{ rawItem.label || rawItem.id }}</span>
            <span v-if="rawItem.intent" class="pill pill-xs">{{ rawItem.intent }}</span>
            <span v-if="rawItem.throttled" class="pill pill-xs pill-warn">Throttled</span>
            <span
              v-if="rawItem.blockedReason"
              class="pill pill-xs pill-warn"
              :title="rawItem.blockedReason"
            >
              {{ blockedReasonLabel(rawItem.blockedReason) }}
            </span>
            <span
              v-if="rawItem.protection"
              class="pill pill-xs"
              :class="rawItem.protection.className"
            >
              {{ rawItem.protection.text }}
            </span>
            <span v-if="rawItem.symbol" class="pill pill-xs">{{ rawItem.symbol }}</span>
            <span v-if="rawItem.market?.exchange" class="pill pill-xs">
              {{ rawItem.market.exchange }}
            </span>
            <span v-if="rawItem.market?.product" class="pill pill-xs">
              {{ rawItem.market.product }}
            </span>
            <span v-if="rawItem.market?.account" class="pill pill-xs">
              {{ rawItem.market.account }}
            </span>
            <span v-if="rawItem.market?.network" class="pill pill-xs">
              {{ rawItem.market.network }}
            </span>
            <span
              v-for="badge in rawItem.badges ?? []"
              :key="`${badge.label}:${badge.tone ?? 'dim'}`"
              class="pill pill-xs"
              :class="`tree-badge-${badge.tone ?? 'dim'}`"
            >
              {{ badge.label }}
            </span>
          </div>
          <span v-if="rawItem.lifecycle" class="text-(--color-text-dim) uppercase text-xs">
            {{ formatName(rawItem.lifecycle) }}
          </span>
          <span v-else-if="rawItem.status" class="text-(--color-text-dim) uppercase text-xs">
            {{ rawItem.status }}
          </span>
        </div>
      </div>
    </template>
  </TreeView>
</template>

<style scoped>
.device-row {
  width: 100%;
  padding: 0 0.5rem 0 calc(var(--tree-indent, 0px) + 0.5rem);
}
.device-row-failed {
  background-color: color-mix(in srgb, var(--color-error) 14%, transparent);
}
.device-row-blocked {
  background-color: color-mix(in srgb, var(--color-warning) 18%, transparent);
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
.tree-badge-info {
  color: var(--color-info);
}
.tree-badge-success {
  color: var(--color-success);
}
.tree-badge-warning {
  color: var(--color-warning);
}
.tree-badge-error {
  color: var(--color-error);
}
</style>
