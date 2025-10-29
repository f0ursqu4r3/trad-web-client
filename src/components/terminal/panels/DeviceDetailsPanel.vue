<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import TrailingEntryDevice from '@/components/terminal/devices/TrailingEntryDevice.vue'
import MarketOrderDevice from '@/components/terminal/devices/MarketOrderDevice.vue'
import StopGuardDevice from '@/components/terminal/devices/StopGuardDevice.vue'
import SplitDevice from '@/components/terminal/devices/SplitDevice.vue'

const { selectedDevice } = storeToRefs(useDeviceStore())

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
      <component
        v-if="deviceComp"
        :is="deviceComp"
        :device="selectedDevice.state as any"
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
