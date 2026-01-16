<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { Settings, ArrowLeft } from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import { useUiStore } from '@/stores/ui'
import { useAccountsStore } from '@/stores/accounts'
import { useAuth0 } from '@auth0/auth0-vue'
import { accountColorFromId } from '@/lib/accountColors'

import WsIndicator from '@/components/general/WsIndicator.vue'
import UserSettings from '@/components/terminal/modals/UserSettings.vue'
import AccountSelect from '@/components/general/AccountSelect.vue'
import CommandInputModal from '@/components/terminal/modals/commands/CommandInputModal.vue'
import CommandModalContainer from '@/components/terminal/modals/commands/CommandModalContainer.vue'

const userStore = useUserStore()
const ui = useUiStore()
const accounts = useAccountsStore()
const { logout } = useAuth0()

const username = computed(() => userStore.displayName || 'anonymous')
const selectedAccount = computed(() => accounts.selectedAccount)

function confirmLogout() {
  if (window.confirm('Are you sure you want to log out?')) {
    logout({ logoutParams: { returnTo: window.location.origin } })
  }
}

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

const isMac = computed(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform))
const msgsShortcut = computed(() => (isMac.value ? '⌘+M' : 'Ctrl+M'))

function toggleMessagesPanel() {
  ui.toggleInboundPanel()
}

function handleGlobalKeys(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const target = event.target as HTMLElement | null
  if (target) {
    const tag = target.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
      return
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'm') {
    event.preventDefault()
    toggleMessagesPanel()
  }
}

onMounted(() => window.addEventListener('keydown', handleGlobalKeys))
onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeys))
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
      <div class="toolbar-row">
        <div class="toolbar-section">
          <span class="muted">logged in as</span>
          <button
            class="logout-btn text-primary hover:text-accent cursor-pointer transition-colors"
            title="Click to log out"
            @click="confirmLogout"
          >
            <ArrowLeft :size="12" class="logout-arrow inline-block" />
            {{ username }}
          </button>
          <span class="muted">|</span>
          <AccountSelect />
        </div>
        <div class="toolbar-section">
          <CommandInputModal />
          <button class="btn btn-ghost" @click="toggleMessagesPanel" :title="msgsShortcut">
            {{ ui.showInboundPanel ? 'Hide msgs' : 'Show msgs' }}
            <span class="kbd">{{ msgsShortcut }}</span>
          </button>
        </div>
        <div class="toolbar-section">
          <WsIndicator />
          <button
            class="btn icon-btn"
            @click="ui.openSettings()"
            title="Settings"
            aria-label="Settings"
          >
            <Settings :size="12" />
          </button>
        </div>
      </div>
      <UserSettings :open="ui.settingsOpen" @close="ui.closeSettings()" />
      <slot></slot>
      <CommandModalContainer />
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

.logout-arrow {
  opacity: 0;
  transform: translateX(4px);
  width: 0;
  transition:
    width 0.15s ease,
    opacity 0.15s ease,
    transform 0.15s ease;
}

.logout-btn {
  /* mr-[12px] hover:mr-0 transition-mr */
  margin-right: 12px;
  transition: margin-right 0.15s ease;
}

.logout-btn:hover {
  margin-right: 0;
}

.logout-btn:hover .logout-arrow {
  opacity: 1;
  width: 12px;
  transform: translateX(0);
}
</style>
