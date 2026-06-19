<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import TrailingEntryDevice from '@/components/terminal/devices/TrailingEntryDevice.vue'
import MarketOrderDevice from '@/components/terminal/devices/MarketOrderDevice.vue'
import StopGuardDevice from '@/components/terminal/devices/StopGuardDevice.vue'
import NativeProtectionDevice from '@/components/terminal/devices/NativeProtectionDevice.vue'
import SplitDevice from '@/components/terminal/devices/SplitDevice.vue'
import { formatMarketRef } from '@/lib/marketContext'
import { protectionDisplay } from '@/lib/protectionState'

const { selectedDevice } = storeToRefs(useDeviceStore())

function fmtDate(d?: Date | null): string {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return '-'
  }
}

const deviceComp = computed(() => {
  if (!selectedDevice.value) return null
  switch (selectedDevice.value.kind) {
    case 'TrailingEntry':
      return TrailingEntryDevice
    case 'MarketOrder':
      return MarketOrderDevice
    case 'StopGuard':
      return StopGuardDevice
    case 'NativeProtection':
      return NativeProtectionDevice
    case 'Split':
      return SplitDevice
    default:
      return null
  }
})

const deviceStatusClass = computed(() => {
  const device = selectedDevice.value
  if (!device) return ''
  if (device.failed) return 'device-details-failed'
  if (device.canceled) return 'device-details-canceled'
  if (device.complete) return 'device-details-complete'
  if (device.awaiting_children) return 'device-details-waiting'
  return 'device-details-active'
})

const marketOrderCreatedAt = computed(() => {
  const device = selectedDevice.value
  if (!device || device.kind !== 'MarketOrder') return null
  return device.created_at
})

const marketRefLabel = computed(() => {
  return formatMarketRef(selectedDevice.value?.market_ref)
})

const protectionSummary = computed(() => {
  return protectionDisplay(selectedDevice.value?.protection_state)
})

function copyDeviceId(): void {
  const id = selectedDevice.value?.id
  if (!id) return
  void navigator.clipboard?.writeText(id)
}
</script>

<template>
  <section class="relative flex flex-col min-h-0 w-full h-full">
    <div
      v-if="selectedDevice"
      class="w-full h-full overflow-auto device-details"
      :class="deviceStatusClass"
    >
      <div
        class="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]"
      >
        <button
          class="font-mono text-[11px] dim hover:text-white"
          type="button"
          @click="copyDeviceId"
        >
          Device ID:
          <span class="text-primary">{{ selectedDevice.id }}</span>
        </button>
        <div class="text-[11px] dim">
          Created:
          <span class="font-mono text-primary">{{ fmtDate(selectedDevice.created_at) }}</span>
        </div>
      </div>
      <div
        v-if="marketRefLabel || protectionSummary"
        class="flex flex-wrap gap-2 px-3 py-2 border-b border-[var(--border-color)]"
      >
        <span v-if="marketRefLabel" class="pill pill-xs">{{ marketRefLabel }}</span>
        <span v-if="protectionSummary" class="pill pill-xs" :class="protectionSummary.className">
          {{ protectionSummary.text }}
        </span>
      </div>
      <component
        v-if="deviceComp"
        :is="deviceComp"
        :device="selectedDevice.state as any"
        :market-ref="selectedDevice.market_ref"
        :protection-state="selectedDevice.protection_state"
        :command-id="selectedDevice.associated_command_id"
        :failure-reason="selectedDevice.failure_reason"
        :failed="selectedDevice.failed"
        :canceled="selectedDevice.canceled"
        :complete="selectedDevice.complete"
        :device-id="selectedDevice.id"
        :created-at="marketOrderCreatedAt"
        class="w-full h-full"
      />
    </div>
    <div
      v-else
      class="flex items-center justify-center h-full text-[var(--color-text-dim)] text-sm"
    >
      No device selected
    </div>
  </section>
</template>

<style scoped>
.device-details-failed {
  background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
}
.device-details-canceled {
  background-color: color-mix(in srgb, var(--color-error) 8%, transparent);
}
.device-details-complete {
  background-color: color-mix(in srgb, var(--color-success) 8%, transparent);
}
.device-details-waiting {
  background-color: color-mix(in srgb, var(--color-info) 8%, transparent);
}
.device-details-active {
  background-color: color-mix(in srgb, var(--color-warning) 8%, transparent);
}
</style>
