<script setup lang="ts">
import { useGatewayStore } from '@/stores/gateway'

// Shown when the gateway speaks another browser protocol version: this page
// reloads once to pick up the new Trad, asks for a reload when that did not
// help, or says the server is mid-update while it keeps reconnecting.
const gateway = useGatewayStore()

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <aside
    v-if="gateway.protocolUpdate !== null"
    class="protocol-update"
    role="alert"
    data-testid="protocol-update"
  >
    <template v-if="gateway.protocolUpdate === 'reloading'">
      <strong>Trad was updated.</strong> Reloading...
    </template>
    <template v-else-if="gateway.protocolUpdate === 'reload_required'">
      <strong>Trad was updated.</strong> Reload this page to continue; trading is paused until then.
      <button type="button" class="btn btn-sm" @click="reload">Reload</button>
    </template>
    <template v-else> <strong>Trad's server is updating.</strong> Reconnecting... </template>
  </aside>
</template>

<style scoped>
.protocol-update {
  position: fixed;
  z-index: 10001;
  top: 0.75rem;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: calc(100vw - 2rem);
  padding: 0.6rem 0.9rem;
  transform: translateX(-50%);
  color: var(--fg);
  background: var(--surface-raised);
  border: 1px solid var(--state-warning);
  box-shadow: 0 6px 24px rgb(0 0 0 / 25%);
}
</style>
