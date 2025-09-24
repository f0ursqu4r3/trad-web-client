<template>
  <SplitView storage-key="trading-terminal-split-horizontal">
    <template #left> left-panel </template>

    <template #center>
      <SplitView orientation="vertical" storage-key="trading-terminal-split-vertical">
        <template #cleft> center-left-panel </template>

        <template #ccenter> center-center-panel </template>

        <template #cright> center-right-panel </template>
      </SplitView>
    </template>

    <template #right> right-panel </template>
  </SplitView>
</template>

<script setup lang="ts">
import SplitView from '@/components/general/SplitView.vue'
</script>
