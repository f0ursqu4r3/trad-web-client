<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useUiStore } from '@/stores/ui'
import DropMenu, { type DropMenuItem } from '@/components/general/DropMenu.vue'
import { DownIcon } from '@/components/icons'
import { accountColorFromId } from '@/lib/accountColors'

const accounts = useAccountsStore()
const ui = useUiStore()

const selectedAccount = computed(() => accounts.selectedAccount)

const accountLabel = computed(() => {
  if (!selectedAccount.value) return 'No account selected'
  const { label, exchange, network } = selectedAccount.value
  return `${label} • ${exchange} • ${network}`
})

const accountColor = computed(() => {
  if (!selectedAccount.value) return 'var(--color-text-dim)'
  const id = selectedAccount.value.id || selectedAccount.value.label
  return accountColorFromId(id)
})

const accountMenuItems = computed<DropMenuItem[]>(() => {
  return accounts.accounts.map((acc) => {
    const color = accountColorFromId(acc.id || acc.label)
    return {
      label: `${acc.label} • ${acc.exchange} • ${acc.network}`,
      value: acc.id,
      className: 'account-menu-item',
      style: {
        background: color,
        color: '#f5f7fa',
      },
      action: () => {
        accounts.selectedAccountId = acc.id
      },
    }
  })
})

function onKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey) {
    const key = event.key
    if (/^[1-9]$/.test(key) || key === '0') {
      const index = key === '0' ? 9 : parseInt(key, 10) - 1
      const account = accounts.accounts[index]
      if (account) {
        accounts.selectedAccountId = account.id
        event.preventDefault()
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="flex items-center space-x-2">
    <span class="muted">Account:</span>
    <DropMenu v-if="accounts.accounts.length > 0" :items="accountMenuItems">
      <template #trigger="{ toggle }">
        <button
          class="btn btn-sm account-trigger"
          type="button"
          :style="{ '--account-color': accountColor }"
          @click.stop="toggle"
        >
          <span class="account-trigger-label">{{ accountLabel }}</span>
          <DownIcon size="12" class="icon" />
        </button>
      </template>
    </DropMenu>
    <button v-else class="link-term" @click="ui.openSettings()">No accounts — configure</button>
  </div>
</template>

<style scoped>
.account-trigger {
  min-width: 280px;
  border-radius: 0;
  background: var(--account-color);
  border-color: var(--account-color);
  color: #f5f7fa;
  padding: 0.2rem 0.6rem;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: none;
}

.account-trigger-label {
  font-size: 12px;
  font-weight: 500;
  color: #f5f7fa;
}

:deep(.account-menu-item) {
  border-top: 1px solid color-mix(in srgb, #ffffff 18%, transparent);
}

:deep(.account-menu-item:hover:not(:disabled)) {
  filter: brightness(1.05);
}
</style>
