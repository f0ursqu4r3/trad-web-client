<template>
  <SplitView
    orientation="vertical"
    storage-key="terminal-orders-column"
    :initial-sizes="[35, 35, 30]"
  >
    <template #accounts>
      <div class="panel">
        <AccountsListPanel />
      </div>
    </template>
    <template #inbound-debug>
      <div class="panel">
        <div class="panel-header dim">messages</div>
        <InboundDebugPanel />
      </div>
    </template>
    <template #command-history>
      <div class="panel">
        <div class="panel-header dim">command history</div>
        <CommandHistory />
      </div>
    </template>
  </SplitView>
</template>

<script setup lang="ts">
import SplitView from '@/components/general/SplitView.vue'
import AccountsListPanel from '@/components/terminal/panels/AccountsListPanel.vue'
import InboundDebugPanel from '@/components/terminal/panels/InboundDebugPanel.vue'
import CommandHistory from '@/components/terminal/panels/CommandHistoryPanel.vue'
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}
</style>
