<script setup lang="ts">
import PriceDistancePresets from '@/components/forms/PriceDistancePresets.vue'
import type { PositionSideIntent } from '@/lib/gateway'

defineProps<{
  accountId: string
  symbol: string
  positionSide: PositionSideIntent
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <PriceDistancePresets
    v-model="model"
    :account-id="accountId"
    :symbol="symbol"
    :position-side="positionSide"
    purpose="stop"
  />
</template>
