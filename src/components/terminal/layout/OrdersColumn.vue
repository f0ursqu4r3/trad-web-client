<template>
  <SplitView
    orientation="horizontal"
    storage-key="terminal-orders-column-main"
    :initial-sizes="[70, 30]"
  >
    <template #primary>
      <SplitView
        orientation="vertical"
        storage-key="terminal-orders-column"
        :initial-sizes="[35, 35, 30]"
      >
        <template #inbound-debug>
          <div class="panel">
            <div class="panel-header dim">messages</div>
            <InboundDebugPanel />
          </div>
        </template>
        <template #command-history>
          <div class="panel">
            <div class="panel-header dim">commands</div>
            <CommandPanel />
          </div>
        </template>
      </SplitView>
    </template>

    <template #secondary>
      <div class="panel">
        <div class="panel-header dim">devices</div>
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
}
</style>
