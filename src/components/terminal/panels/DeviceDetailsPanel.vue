<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import TrailingEntryDevice from '@/components/terminal/devices/TrailingEntryDevice.vue'
import MarketOrderDevice from '@/components/terminal/devices/MarketOrderDevice.vue'
import StopGuardDevice from '@/components/terminal/devices/StopGuardDevice.vue'
import SplitDevice from '@/components/terminal/devices/SplitDevice.vue'

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
    case 'Split':
      return SplitDevice
    default:
      return null
  }
})
</script>

<template>
  <section class="relative flex flex-col min-h-0 w-full h-full">
    <div v-if="selectedDevice" class="w-full h-full overflow-auto">
      <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
        <button
          class="font-mono text-[11px] text-[var(--color-text-dim)] hover:text-white"
          type="button"
          @click="navigator.clipboard?.writeText(selectedDevice.id)"
        >
          Device ID:
          <span class="text-[var(--color-text)]">{{ selectedDevice.id }}</span>
        </button>
        <div class="text-[11px] text-[var(--color-text-dim)]">
          Created:
          <span class="font-mono text-[var(--color-text)]">{{
            fmtDate(selectedDevice.created_at)
          }}</span>
        </div>
      </div>
      <component
        v-if="deviceComp"
        :is="deviceComp"
        :device="selectedDevice.state as any"
        :failure-reason="selectedDevice.failure_reason"
        :failed="selectedDevice.failed"
        :canceled="selectedDevice.canceled"
        :complete="selectedDevice.complete"
        :device-id="selectedDevice.id"
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
