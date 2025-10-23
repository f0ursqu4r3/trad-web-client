<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '@/stores/devices'
import type { TrailingEntry } from '@/stores/devices'
import TrailingEntryDevice from '@/components/terminal/devices/TrailingEntryDevice.vue'

const { selectedDevice } = storeToRefs(useDeviceStore())

const deviceComp = computed(() => {
  if (!selectedDevice.value) return null
  switch (selectedDevice.value.kind) {
    case 'TrailingEntry':
      return TrailingEntryDevice
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
        :device="selectedDevice.state as TrailingEntry"
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
