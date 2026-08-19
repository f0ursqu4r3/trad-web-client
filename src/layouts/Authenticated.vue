<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { accountColorFromId } from '@/lib/accountColors'
import AccountSelect from '@/components/general/AccountSelect.vue'
import EngineCommandModalContainer from '@/components/engine/commands/EngineCommandModalContainer.vue'
import AppHeader from '@/components/general/AppHeader.vue'

const accounts = useAccountsStore()
const selectedAccount = computed(() => accounts.selectedAccount)

const railLabel = computed(() => {
  if (!selectedAccount.value) return 'No account selected'
  const label = selectedAccount.value.label
  const exchange = selectedAccount.value.exchange
  const network = selectedAccount.value.network
  return `${label} • ${exchange} • ${network}`
})

const railColor = computed(() => {
  if (!selectedAccount.value) return undefined
  const id = selectedAccount.value.id || selectedAccount.value.label
  return accountColorFromId(id)
})

const railTextColor = computed(() => {
  // Match AccountSelect: light text on colored bg, dim text when no account
  return selectedAccount.value ? '#f5f7fa' : 'var(--color-text-dim)'
})
</script>

<template>
  <div class="relative w-full h-full overflow-hidden flex">
    <div
      class="account-rail flex justify-center items-end px-1 py-2 h-full"
      :style="railColor ? { '--account-rail-color': railColor } : {}"
    >
      <div
        class="writing-sideways-lr text-xs tracking-wide uppercase whitespace-nowrap"
        :style="{ color: railTextColor }"
      >
        {{ railLabel }}
      </div>
    </div>
    <div class="flex flex-col w-full h-full overflow-hidden">
      <AppHeader show-connection />
      <div class="toolbar-row terminal-context-toolbar">
        <div class="toolbar-section">
          <AccountSelect />
        </div>
        <span class="terminal-context-label">Execution workspace</span>
      </div>
      <slot></slot>
      <EngineCommandModalContainer />
    </div>
  </div>
</template>

<style scoped>
.account-rail {
  --_rail-color: var(--account-rail-color, var(--panel-header-bg));
  --_has-account: var(--account-rail-color, transparent);
  /* When account selected: mix 70% color with panel-header-bg (like AccountSelect)
     When no account: fall back to panel-header-bg (like toolbar-row) */
  background: color-mix(in srgb, var(--_rail-color) 70%, var(--panel-header-bg));
  border-right: 1px solid
    color-mix(in srgb, var(--_rail-color) var(--account-rail-border-alpha), var(--border-color));
}

.terminal-context-toolbar {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  padding-block: 0.2rem;
}
.terminal-context-label {
  padding-right: 0.5rem;
  color: var(--fg-muted);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
</style>
