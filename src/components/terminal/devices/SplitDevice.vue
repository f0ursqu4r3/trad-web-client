<script setup lang="ts">
import { computed } from 'vue'
import { useDeviceStore } from '@/stores/devices'
import type { SplitState } from '@/stores/devices'
import { MarketAction } from '@/lib/ws/protocol'
import { formatPrice, formatQty } from './utils'

const props = defineProps<{
  device: SplitState
  failed?: boolean | null
  canceled?: boolean | null
  complete?: boolean | null
  deviceId?: string | null
}>()

const deviceStore = useDeviceStore()

const splitIntent = computed(() => {
  const id = props.deviceId
  if (!id) return null
  const record = deviceStore.devices.find((d) => d.id === id)
  if (!record?.children_devices?.length) return null
  const actions = new Set<string>()
  record.children_devices.forEach((childId) => {
    const child = deviceStore.devices.find((d) => d.id === childId)
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
})
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Header -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono text-primary m-0">Split Device</h3>
        <div class="flex items-center gap-2">
          <span v-if="splitIntent" class="pill pill-sm text-[10px] px-2 py-1">
            {{ splitIntent }}
          </span>
          <span v-if="failed" class="pill pill-err text-[10px] px-2 py-1">Failed</span>
          <span v-else-if="canceled" class="pill pill-warn text-[10px] px-2 py-1">Canceled</span>
          <span v-else-if="complete" class="pill pill-ok text-[10px] px-2 py-1">Completed</span>
        </div>
      </div>
      <div class="text-[11px] dim font-mono">
        {{ device.symbol }}
      </div>
    </div>

    <!-- Parameters -->
    <div class="space-y-3">
      <h4 class="section-title">Parameters</h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="dt-label">Quantity</dt>
          <dd class="m-0 font-mono text-primary">{{ formatQty(device.quantity) }}</dd>
        </div>
        <div>
          <dt class="dt-label">Price</dt>
          <dd class="m-0 font-mono text-primary">${{ formatPrice(device.price) }}</dd>
        </div>
      </div>
    </div>
  </div>
</template>
