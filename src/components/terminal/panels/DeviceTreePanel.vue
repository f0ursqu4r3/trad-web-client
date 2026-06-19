<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { formatName } from '@/lib/utils'
import { TreeView, type TreeItem } from '@/components/general/TreeView'
import { Folder, FolderOpen, TrendingDown } from 'lucide-vue-next'
import {
  useDeviceStore,
  type Device,
  type DeviceState,
  type MarketOrderState,
  type TrailingEntryState,
} from '@/stores/devices'
import { useCommandStore } from '@/stores/command'
import { useAccountsStore } from '@/stores/accounts'
import { MarketAction } from '@/lib/ws/protocol'
import { recordPerfDuration, getPerfThreshold } from '@/lib/perfLog'
import {
  accountLabelForContext,
  marketContextAccountId,
  marketContextExchangeLabel,
  marketContextProductKey,
  marketRefExchangeLabel,
  marketProductLabel,
  networkLabel,
  normalizeMarketContext,
  networkLabelForContext,
} from '@/lib/marketContext'
import type { MarketContext, MarketRef } from '@/lib/ws/protocol'

const store = useDeviceStore()
const commandStore = useCommandStore()
const accountsStore = useAccountsStore()

const { devices, selectedDeviceId } = storeToRefs(store)
const { selectedCommandId } = storeToRefs(commandStore)

// Start fully expanded by default: track only collapsed ids
const collapsed = ref<(string | number)[]>([])
const deviceFilters = ref<{
  exchange: string[]
  product: string[]
  account: string[]
}>({
  exchange: [],
  product: [],
  account: [],
})

type DeviceFilterGroup = keyof typeof deviceFilters.value
type DeviceMarketFacet = {
  exchange: string
  product: string
  account: string | null
  labels: {
    exchange: string | null
    product: string | null
    account: string | null
    network: string | null
  }
}

function hasMarketContext(
  state: DeviceState,
): state is DeviceState & { market_context: MarketContext } {
  return 'market_context' in state
}

function directMarketContext(device: Device): MarketContext | null {
  if (!hasMarketContext(device.state)) return null
  return normalizeMarketContext(device.state.market_context)
}

function marketContextFacet(ctx: MarketContext | null | undefined): DeviceMarketFacet | null {
  if (!ctx || ctx.type === 'none') return null
  const accountId = marketContextAccountId(ctx)
  const product = marketContextProductKey(ctx)
  return {
    exchange: ctx.type,
    product,
    account: accountId,
    labels: {
      exchange: marketContextExchangeLabel(ctx),
      product: marketProductLabel(product),
      account: accountLabelForContext(ctx, accountsStore.accounts),
      network: networkLabelForContext(ctx, accountsStore.accounts),
    },
  }
}

function marketRefFacet(ref: MarketRef | null | undefined): DeviceMarketFacet | null {
  if (!ref) return null
  const product = ref.product ?? 'none'
  return {
    exchange: ref.exchange,
    product,
    account: ref.trading_account_id ?? null,
    labels: {
      exchange: marketRefExchangeLabel(ref.exchange),
      product: ref.product ? marketProductLabel(ref.product) : null,
      account:
        ref.trading_account_label ??
        (ref.trading_account_id ? `${ref.trading_account_id.slice(0, 8)}...` : null),
      network: ref.network ? networkLabel(ref.network) : null,
    },
  }
}

function directDeviceMarketFacet(device: Device): DeviceMarketFacet | null {
  return marketRefFacet(device.market_ref) ?? marketContextFacet(directMarketContext(device))
}

function inheritedDeviceMarketFacet(
  device: Device,
  byId: Map<string, Device>,
  seen = new Set<string>(),
): DeviceMarketFacet | null {
  if (seen.has(device.id)) return null
  seen.add(device.id)

  const direct = directDeviceMarketFacet(device)
  if (direct) return direct

  if (device.parent_device) {
    const parent = byId.get(device.parent_device)
    if (parent) {
      const parentFacet = inheritedDeviceMarketFacet(parent, byId, seen)
      if (parentFacet) return parentFacet
    }
  }

  for (const childId of device.children_devices ?? []) {
    const child = byId.get(childId)
    if (!child) continue
    const childFacet = inheritedDeviceMarketFacet(child, byId, seen)
    if (childFacet) return childFacet
  }
  return null
}

const commandScopedDevices = computed<Device[]>(() => {
  return devices.value.filter((device) => {
    if (!selectedCommandId.value) return true
    return device.associated_command_id === selectedCommandId.value
  }) as Device[]
})

const deviceMarketFacetMap = computed<Map<string, DeviceMarketFacet>>(() => {
  const byId = new Map(commandScopedDevices.value.map((device) => [device.id, device]))
  const facets = new Map<string, DeviceMarketFacet>()
  commandScopedDevices.value.forEach((device) => {
    const facet = inheritedDeviceMarketFacet(device, byId)
    if (facet) {
      facets.set(device.id, facet)
    }
  })
  return facets
})

const activeDeviceExchanges = computed<string[]>(() => {
  return Array.from(
    new Set([...deviceMarketFacetMap.value.values()].map((facet) => facet.exchange)),
  ).sort()
})

const activeDeviceProducts = computed<string[]>(() => {
  return Array.from(
    new Set([...deviceMarketFacetMap.value.values()].map((facet) => facet.product)),
  ).sort()
})

const activeDeviceAccounts = computed<string[]>(() => {
  const ids = new Set<string>()
  deviceMarketFacetMap.value.forEach((facet) => {
    if (facet.account) ids.add(facet.account)
  })
  return Array.from(ids).sort()
})

const hiddenDeviceCount = computed(
  () => commandScopedDevices.value.length - filteredDevices.value.length,
)

const filteredDevices = computed<Device[]>(() => {
  const exchangeFilter = deviceFilters.value.exchange
  const productFilter = deviceFilters.value.product
  const accountFilter = deviceFilters.value.account
  return commandScopedDevices.value.filter((device) => {
    const facet = deviceMarketFacetMap.value.get(device.id)
    const exchange = facet?.exchange ?? 'none'
    if (exchangeFilter.length > 0 && !exchangeFilter.includes(exchange)) return false
    const product = facet?.product ?? 'none'
    if (productFilter.length > 0 && !productFilter.includes(product)) return false
    const accountId = facet?.account ?? ''
    if (accountFilter.length > 0 && !accountFilter.includes(accountId)) return false
    return true
  })
})

function getDeviceFilter(group: DeviceFilterGroup): readonly string[] {
  return deviceFilters.value[group]
}

function toggleDeviceFilter(group: DeviceFilterGroup, option: string, event?: MouseEvent) {
  if (event?.shiftKey) {
    deviceFilters.value[group] = [option]
    return
  }
  const list = getDeviceFilter(group)
  if (list.includes(option)) {
    deviceFilters.value[group] = list.filter((item) => item !== option)
  } else {
    deviceFilters.value[group] = [...list, option]
  }
}

function isDeviceFilterActive(group: DeviceFilterGroup, option: string) {
  return getDeviceFilter(group).includes(option)
}

function clearDeviceFilters() {
  deviceFilters.value.exchange = []
  deviceFilters.value.product = []
  deviceFilters.value.account = []
}

function getAccountLabel(accountId: string): string {
  const facetLabel = [...deviceMarketFacetMap.value.values()].find(
    (facet) => facet.account === accountId && facet.labels.account,
  )?.labels.account
  if (facetLabel) return facetLabel
  const account = accountsStore.accounts.find((item) => item.id === accountId)
  return account
    ? `${account.label} (${formatName(account.exchange)})`
    : `${accountId.slice(0, 8)}...`
}

const treeData = computed<TreeItem[]>(() => {
  const start = performance.now()
  const list = filteredDevices.value
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
    const throttled =
      device.kind === 'MarketOrder' ? (device.state as MarketOrderState)?.throttle : false
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
      market: deviceMarketFacetMap.value.get(device.id)?.labels ?? null,
      lifecycle: device.complete || device.failed || device.canceled ? '' : teLifecycle,
      status: statusLabel(device),
      intent,
      throttled,
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

  const duration = performance.now() - start
  if (duration >= getPerfThreshold()) {
    recordPerfDuration('DeviceTree:build', duration, { devices: list.length, roots: roots.length })
  }

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
  <div class="w-full h-full scroll-area p-2 space-y-2">
    <div
      v-if="
        activeDeviceExchanges.length || activeDeviceProducts.length || activeDeviceAccounts.length
      "
      class="device-filters"
    >
      <div v-if="activeDeviceExchanges.length" class="filter-group">
        <span class="filter-label">Exchange</span>
        <button
          v-for="option in activeDeviceExchanges"
          :key="option"
          class="btn btn-sm btn-ghost filter-btn"
          :data-pressed="isDeviceFilterActive('exchange', option)"
          :aria-pressed="isDeviceFilterActive('exchange', option)"
          @click="toggleDeviceFilter('exchange', option, $event)"
        >
          {{ formatName(option) }}
        </button>
      </div>
      <div v-if="activeDeviceProducts.length" class="filter-group">
        <span class="filter-label">Product</span>
        <button
          v-for="option in activeDeviceProducts"
          :key="option"
          class="btn btn-sm btn-ghost filter-btn"
          :data-pressed="isDeviceFilterActive('product', option)"
          :aria-pressed="isDeviceFilterActive('product', option)"
          @click="toggleDeviceFilter('product', option, $event)"
        >
          {{ marketProductLabel(option) }}
        </button>
      </div>
      <div v-if="activeDeviceAccounts.length" class="filter-group">
        <span class="filter-label">Account</span>
        <button
          v-for="option in activeDeviceAccounts"
          :key="option"
          class="btn btn-sm btn-ghost filter-btn"
          :data-pressed="isDeviceFilterActive('account', option)"
          :aria-pressed="isDeviceFilterActive('account', option)"
          @click="toggleDeviceFilter('account', option, $event)"
        >
          {{ getAccountLabel(option) }}
        </button>
      </div>
      <button
        v-if="hiddenDeviceCount > 0"
        class="btn btn-sm btn-ghost ml-auto"
        @click="clearDeviceFilters"
      >
        Hidden {{ hiddenDeviceCount }}
      </button>
    </div>
    <div
      v-if="!treeData.length"
      class="h-full flex items-center justify-center text-(--color-text-dim) text-center text-xs"
    >
      {{
        hiddenDeviceCount > 0
          ? 'No devices match the active filters.'
          : 'Select a command to view its device tree.'
      }}
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
              <span v-if="item.throttled" class="pill pill-xs pill-warn">Throttled</span>
              <span v-if="item.symbol" class="pill pill-xs">
                {{ item.symbol }}
              </span>
              <span v-if="item.market?.exchange" class="pill pill-xs">
                {{ item.market.exchange }}
              </span>
              <span v-if="item.market?.product" class="pill pill-xs">
                {{ item.market.product }}
              </span>
              <span v-if="item.market?.account" class="pill pill-xs">
                {{ item.market.account }}
              </span>
              <span v-if="item.market?.network" class="pill pill-xs">
                {{ item.market.network }}
              </span>
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
.device-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.25rem;
  border: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--color-panel) 92%, transparent);
}

.filter-group {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}

.filter-label {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}

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
