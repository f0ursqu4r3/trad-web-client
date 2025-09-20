<script setup lang="ts">
// Placeholder details for selected device
import { reactive } from 'vue'

const device = reactive({
  id: 'f3152000-bdd3-4105-8564-dd6dd78e9ce9',
  direction: 'LONG',
  activationPrice: 600.25,
  jumpThreshold: 0.02,
  stopLoss: 599.0,
  riskAmount: 50,
  currentPeak: 599.48,
  status: 'Succeeded',
  entryPrice: 599.7,
  positionSize: 29.41154,
})
</script>

<template>
  <section class="panel device-details">
    <header class="panel-header">Device</header>
    <dl>
      <div>
        <dt>ID</dt>
        <dd>{{ device.id }}</dd>
      </div>
      <div>
        <dt>Dir</dt>
        <dd>{{ device.direction }}</dd>
      </div>
      <div>
        <dt>Activation</dt>
        <dd>{{ device.activationPrice }}</dd>
      </div>
      <div>
        <dt>Jump Thresh</dt>
        <dd>{{ (device.jumpThreshold * 100).toFixed(2) }}%</dd>
      </div>
      <div>
        <dt>Stop Loss</dt>
        <dd>{{ device.stopLoss }}</dd>
      </div>
      <div>
        <dt>Risk</dt>
        <dd>${{ device.riskAmount }}</dd>
      </div>
      <div>
        <dt>Peak</dt>
        <dd>{{ device.currentPeak }}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>{{ device.status }}</dd>
      </div>
      <div>
        <dt>Entry</dt>
        <dd>{{ device.entryPrice }}</dd>
      </div>
      <div>
        <dt>Size</dt>
        <dd>{{ device.positionSize }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.device-details {
  font-family: var(--font-mono);
  font-size: 11px;
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
