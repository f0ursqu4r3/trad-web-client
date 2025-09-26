<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTerminalStore } from '@/stores/terminal'

const { selectedDevice } = storeToRefs(useTerminalStore())
</script>

<template>
  <section class="device-details" v-if="selectedDevice">
    <dl>
      <div>
        <dt>ID</dt>
        <dd>{{ selectedDevice.id }}</dd>
      </div>
      <div>
        <dt>Dir</dt>
        <dd>{{ selectedDevice.direction }}</dd>
      </div>
      <div>
        <dt>Activation</dt>
        <dd>{{ selectedDevice.activationPrice }}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{{ selectedDevice.status }}</dd>
      </div>
      <div v-if="selectedDevice.entryPrice">
        <dt>Entry</dt>
        <dd>{{ selectedDevice.entryPrice }}</dd>
      </div>
    </dl>
  </section>
  <section class="panel device-details" v-else>
    <header class="panel-header">Device</header>
    <div style="padding: 6px; font-size: 12px; opacity: 0.7">No device selected.</div>
  </section>
</template>

<style scoped>
.device-details {
  font-family: var(--font-mono);
  font-size: 11px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
.device-details dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  padding: 6px;
}
.device-details dt {
  opacity: 0.6;
}
</style>
