<template>
  <SplitView
    orientation="vertical"
    storage-key="terminal-orders-column"
    :initial-sizes="[35, 35, 30]"
  >
    <template #inbound-debug>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Messages</span></div>
        <InboundDebugPanel />
      </div>
    </template>
    <template #command-history>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Commands</span></div>
        <CommandPanel />
      </div>
    </template>
    <template #device-tree>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Devices</span></div>
        <DeviceTreePanel />
      </div>
    </template>
  </SplitView>
</template>

<script setup lang="ts">
import SplitView from '@/components/general/SplitView.vue'
import InboundDebugPanel from '@/components/terminal/panels/InboundDebugPanel.vue'
import CommandPanel from '@/components/terminal/panels/CommandPanel.vue'
import DeviceTreePanel from '../panels/DeviceTreePanel.vue'
</script>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  border-radius: 0;
}
</style>
