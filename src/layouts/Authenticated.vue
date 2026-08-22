<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useUiStore } from '@/stores/ui'
import { accountColorFromId } from '@/lib/accountColors'
import EngineCommandModalContainer from '@/components/engine/commands/EngineCommandModalContainer.vue'
import AppHeader from '@/components/general/AppHeader.vue'

const accounts = useAccountsStore()
const ui = useUiStore()
const selectedAccount = computed(() => accounts.selectedAccount)
const appHeader = ref<InstanceType<typeof AppHeader> | null>(null)

const railAddress = computed(() => {
  const metadata = selectedAccount.value?.exchange_metadata
  return metadata?.user_address || metadata?.exchange_account_id || ''
})

const abbreviatedAddress = computed(() => {
  const address = railAddress.value
  if (address.length <= 18) return address
  return `${address.slice(0, 10)}…${address.slice(-6)}`
})

const railLabel = computed(() => {
  if (!selectedAccount.value) return 'No account selected'
  const label = selectedAccount.value.label
  const exchange = selectedAccount.value.exchange
  const network = selectedAccount.value.network
  const address = abbreviatedAddress.value ? ` • ${abbreviatedAddress.value}` : ''
  return `${label} • ${exchange} • ${network}${address}`
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

function openAccountSelector(): void {
  appHeader.value?.openAccountSelector()
}
</script>

<template>
  <div class="authenticated-shell relative w-full h-full overflow-hidden flex">
    <button
      class="account-rail"
      :style="railColor ? { '--account-rail-color': railColor } : {}"
      type="button"
      :disabled="accounts.accounts.length === 0"
      :title="railAddress ? `Switch account · ${railAddress}` : 'Switch account'"
      :aria-label="
        railAddress ? `Switch trading account. Current address ${railAddress}` : railLabel
      "
      data-testid="account-identity-rail"
      @click="openAccountSelector"
    >
      <span
        v-if="ui.animateAccountRail"
        class="account-rail-track"
        :style="{ color: railTextColor }"
      >
        <span v-for="copy in 2" :key="copy" class="account-rail-segment">
          <span class="account-rail-label">{{ railLabel }}</span>
        </span>
      </span>
      <span v-else class="account-rail-static" :style="{ color: railTextColor }">
        <span class="account-rail-label">{{ railLabel }}</span>
      </span>
    </button>
    <div class="authenticated-content flex flex-col w-full h-full overflow-hidden">
      <AppHeader ref="appHeader" show-connection show-account-selector />
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
  position: relative;
  width: 24px;
  height: 100%;
  flex: none;
  overflow: hidden;
  padding: 0;
  color: inherit;
  cursor: pointer;
}
.account-rail:disabled {
  cursor: default;
}
.account-rail:hover:not(:disabled),
.account-rail:focus-visible {
  filter: brightness(1.12);
}
.account-rail-track {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 100%;
  flex-direction: column;
  animation: account-rail-scroll 18s linear infinite;
}
.account-rail:hover .account-rail-track,
.account-rail:focus-visible .account-rail-track {
  animation-play-state: paused;
}
.account-rail-segment {
  display: flex;
  width: 100%;
  height: 100vh;
  flex: none;
  align-items: center;
  justify-content: center;
}
.account-rail-static {
  position: absolute;
  top: 0.5rem;
  right: 0;
  left: 0;
  display: flex;
  justify-content: center;
}
.account-rail-label {
  display: block;
  font-size: 11px;
  letter-spacing: 0.055em;
  text-transform: uppercase;
  transform: rotate(90deg);
  transform-origin: center;
  white-space: nowrap;
}
@keyframes account-rail-scroll {
  from {
    transform: translateY(-100vh);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes account-rail-scroll-mobile {
  from {
    transform: translateX(-100vw);
  }
  to {
    transform: translateX(0);
  }
}
@media (max-width: 650px) {
  .authenticated-shell {
    flex-direction: column;
  }
  .authenticated-content {
    min-height: 0;
    flex: 1;
  }
  .account-rail {
    width: 100%;
    height: 20px;
    border-right: 0;
    border-bottom: 1px solid
      color-mix(in srgb, var(--_rail-color) var(--account-rail-border-alpha), var(--border-color));
  }
  .account-rail-track {
    width: max-content;
    height: 100%;
    flex-direction: row;
    animation-name: account-rail-scroll-mobile;
  }
  .account-rail-segment {
    width: 100vw;
    height: 100%;
    align-items: center;
    padding-top: 0;
  }
  .account-rail-static {
    inset: 0;
    align-items: center;
  }
  .account-rail-label {
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .account-rail-track {
    animation: none;
  }
}
</style>
