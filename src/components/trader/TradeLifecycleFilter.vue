<script setup lang="ts">
// Active, closed or all trades, with the live projection's counts.

export type TradeLifecycleFilterValue = 'active' | 'closed' | 'all'

defineProps<{ activeCount: number; closedCount: number }>()
const filter = defineModel<TradeLifecycleFilterValue>({ required: true })
</script>

<template>
  <button
    class="btn btn-sm"
    type="button"
    :aria-pressed="filter === 'active'"
    @click="filter = 'active'"
  >
    Active {{ activeCount }}
  </button>
  <button
    class="btn btn-sm"
    type="button"
    :aria-pressed="filter === 'closed'"
    @click="filter = 'closed'"
  >
    Closed {{ closedCount }}
  </button>
  <button class="btn btn-sm" type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">
    All {{ activeCount + closedCount }}
  </button>
</template>
