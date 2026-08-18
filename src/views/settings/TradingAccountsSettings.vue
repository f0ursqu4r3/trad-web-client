<script setup lang="ts">
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import AccountsListPanel from '@/components/terminal/panels/AccountsListPanel.vue'
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Trading accounts"
    description="Add exchange accounts, inspect readiness, set account defaults, and perform safe account maintenance."
  />
  <div class="min-h-[520px]"><AccountsListPanel mode="full" /></div>
</template>
