<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="relative w-full h-full overflow-hidden flex">
    <div class="account-rail" :style="{ '--account-rail-color': railColor }">
      <div class="account-rail-text">{{ railLabel }}</div>
    </div>
    <div class="flex flex-col w-full h-full overflow-hidden">
      <div class="toolbar-row">
        <div class="toolbar-section">
          <span class="muted">logged in as</span>
          <span class="text-[var(--color-text)]">{{ username }}</span>
          <span class="muted">|</span>
          <AccountSelect />
        </div>
        <div class="toolbar-section">
          <CommandInputModal />
        </div>
        <div class="toolbar-section">
          <WsIndicator />
          <button
            class="btn icon-btn"
            @click="ui.openSettings()"
            title="Settings"
            aria-label="Settings"
          >
            <CogIcon />
          </button>
        </div>
      </div>
      <UserSettings :open="ui.settingsOpen" @close="ui.closeSettings()" />
      <slot></slot>
      <CommandModalContainer />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CogIcon } from '@/components/icons'
import { useUserStore } from '@/stores/user'
import { useUiStore } from '@/stores/ui'
import { useAccountsStore } from '@/stores/accounts'
import { accountColorFromId } from '@/lib/accountColors'

import WsIndicator from '@/components/general/WsIndicator.vue'
import UserSettings from '@/components/terminal/modals/UserSettings.vue'
import AccountSelect from '@/components/general/AccountSelect.vue'
import CommandInputModal from '@/components/terminal/modals/commands/CommandInputModal.vue'
import CommandModalContainer from '@/components/terminal/modals/commands/CommandModalContainer.vue'

const userStore = useUserStore()
const ui = useUiStore()
const accounts = useAccountsStore()

const username = computed(() => userStore.displayName || 'anonymous')
const selectedAccount = computed(() => accounts.selectedAccount)

const railLabel = computed(() => {
  if (!selectedAccount.value) return 'No account selected'
  const label = selectedAccount.value.label
  const exchange = selectedAccount.value.exchange
  const network = selectedAccount.value.network
  return `${label} • ${exchange} • ${network}`
})

const railColor = computed(() => {
  if (!selectedAccount.value) return 'var(--color-text-dim)'
  const id = selectedAccount.value.id || selectedAccount.value.label
  return accountColorFromId(id)
})
</script>

<style scoped>
.account-rail {
  width: 22px;
  background: color-mix(in srgb, var(--account-rail-color) 70%, var(--panel-header-bg));
  border-right: 1px solid color-mix(in srgb, var(--account-rail-color) 45%, var(--border-color));
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 6px 0 8px 4px;
  flex-shrink: 0;
}

.account-rail-text {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--color-text);
  text-transform: uppercase;
  opacity: 0.85;
  white-space: nowrap;
  margin-left: 0;
  margin-top: auto;
  text-align: left;
  width: 100%;
}
</style>
