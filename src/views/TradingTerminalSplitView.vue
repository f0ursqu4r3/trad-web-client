<template>
  <SplitView storage-key="trading-terminal-split-horizontal">
    <template #left>
      <OrdersColumn />
    </template>

    <template #right> right-panel </template>
  </SplitView>
</template>

<script setup lang="ts">
import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
</script>
