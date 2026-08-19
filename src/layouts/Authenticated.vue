<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { accountColorFromId } from '@/lib/accountColors'
import { resolveEnvironmentBranding } from '@/lib/environmentBranding'

import WsIndicator from '@/components/general/WsIndicator.vue'
import AccountSelect from '@/components/general/AccountSelect.vue'
import UserAccountMenu from '@/components/general/UserAccountMenu.vue'
import EngineCommandPalette from '@/components/engine/commands/EngineCommandPalette.vue'
import EngineCommandModalContainer from '@/components/engine/commands/EngineCommandModalContainer.vue'

const accounts = useAccountsStore()
const brand = resolveEnvironmentBranding(window.location.hostname)
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
      <div class="toolbar-row terminal-toolbar">
        <div class="toolbar-section terminal-toolbar-left">
          <AccountSelect />
          <span class="terminal-toolbar-divider" aria-hidden="true"></span>
          <EngineCommandPalette />
        </div>
        <RouterLink class="terminal-brand" to="/terminal" aria-label="Trad terminal">
          <img :src="brand.appIconPath" alt="" />
          <span>TRAD</span>
        </RouterLink>
        <div class="toolbar-section terminal-toolbar-right">
          <WsIndicator />
          <UserAccountMenu />
        </div>
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

.terminal-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  padding-block: 0.25rem;
}
.terminal-toolbar-left {
  min-width: 0;
  justify-self: start;
}
.terminal-toolbar-right {
  justify-self: end;
}
.terminal-toolbar-divider {
  width: 1px;
  height: 22px;
  background: var(--border-normal);
}
.terminal-brand {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--fg-strong);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.terminal-brand img {
  width: 22px;
  height: 22px;
}
@media (max-width: 980px) {
  .terminal-brand span,
  .terminal-toolbar-divider {
    display: none;
  }
  .terminal-toolbar-left {
    gap: 0.35rem;
  }
}
</style>
