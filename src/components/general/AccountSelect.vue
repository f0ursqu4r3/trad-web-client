<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, WalletCards } from 'lucide-vue-next'
import { accountIdentityChips, useAccountsStore } from '@/stores/accounts'
import { useUiStore } from '@/stores/ui'
import DropMenu, { type DropMenuItem } from '@/components/general/DropMenu.vue'
import { accountColorFromId } from '@/lib/accountColors'
import { recordTelemetry } from '@/lib/telemetry'

const accounts = useAccountsStore()
const ui = useUiStore()
const menu = ref<InstanceType<typeof DropMenu> | null>(null)
const copiedAddress = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const selectedAccount = computed(() => accounts.selectedAccount)

const accountLabel = computed(() => {
  if (!selectedAccount.value) return 'No account selected'
  return selectedAccount.value.label
})

const accountColor = computed(() => {
  if (!selectedAccount.value) return 'var(--color-text-dim)'
  const id = selectedAccount.value.id || selectedAccount.value.label
  return accountColorFromId(id)
})

const selectedAddress = computed(() => {
  const metadata = selectedAccount.value?.exchange_metadata
  return metadata?.user_address || metadata?.exchange_account_id || ''
})

function abbreviatedAddress(value: string): string {
  if (value.length <= 18) return value
  return `${value.slice(0, 10)}…${value.slice(-6)}`
}

async function copySelectedAddress(): Promise<void> {
  if (!selectedAddress.value) return
  try {
    await navigator.clipboard.writeText(selectedAddress.value)
    copiedAddress.value = true
    recordTelemetry({
      eventName: 'support_reference_copied',
      accountId: selectedAccount.value?.id ?? null,
      properties: { source: 'account_selector' },
    })
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedAddress.value = false
      copiedTimer = null
    }, 1800)
  } catch {
    copiedAddress.value = false
  }
}

const accountMenuItems = computed<DropMenuItem[]>(() => {
  const accountItems = accounts.accounts.map((acc) => {
    const color = accountColorFromId(acc.id || acc.label)
    const address =
      acc.exchange_metadata?.user_address || acc.exchange_metadata?.exchange_account_id
    return {
      label: `${acc.label} • ${accountIdentityChips(acc).join(' • ')}${address ? ` • ${abbreviatedAddress(address)}` : ''}`,
      title: address || acc.label,
      value: acc.id,
      className: 'account-menu-item',
      style: {
        background: `color-mix(in srgb, ${color} 70%, var(--panel-header-bg))`,
        color: '#f5f7fa',
      },
      action: () => {
        accounts.selectedAccountId = acc.id
      },
    }
  })

  if (!selectedAddress.value) return accountItems
  return [
    ...accountItems,
    {
      label: copiedAddress.value
        ? `Address copied • ${abbreviatedAddress(selectedAddress.value)}`
        : `Copy selected address • ${abbreviatedAddress(selectedAddress.value)}`,
      title: selectedAddress.value,
      value: 'copy-selected-address',
      className: 'account-menu-copy',
      action: () => void copySelectedAddress(),
    },
  ]
})

function open(): void {
  void menu.value?.open()
}

defineExpose({ open })

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
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div class="account-select">
    <DropMenu v-if="accounts.accounts.length > 0" ref="menu" :items="accountMenuItems">
      <template #trigger="{ toggle }">
        <button
          class="btn btn-sm account-trigger"
          type="button"
          :style="{ '--account-color': accountColor }"
          :aria-label="`Switch trading account: ${accountLabel}`"
          title="Switch trading account"
          @click.stop="toggle"
        >
          <WalletCards :size="13" aria-hidden="true" />
          <span class="account-trigger-label">{{ accountLabel }}</span>
          <ChevronDown :size="12" class="icon" />
        </button>
      </template>
    </DropMenu>
    <button v-else class="link-term" @click="ui.openSettings()">No accounts — configure</button>
  </div>
</template>

<style scoped>
.account-select {
  display: flex;
  min-width: 0;
  align-items: center;
}
.account-trigger {
  min-width: 210px;
  max-width: min(300px, 30vw);
  border-radius: var(--radius-btn);
  background: color-mix(in srgb, var(--account-color) 70%, var(--panel-header-bg));
  border-color: color-mix(in srgb, var(--account-color) 45%, var(--border-color));
  color: #f5f7fa;
  padding: 0.3rem 0.65rem;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  box-shadow: none;
}

.account-trigger-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: #f5f7fa;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

@media (max-width: 980px) {
  .account-trigger {
    min-width: 160px;
    max-width: 25vw;
  }
}

.account-trigger .icon {
  margin-left: auto;
}

:deep(.account-menu-item) {
  border-top: 1px solid color-mix(in srgb, #ffffff 18%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

:deep(.account-menu-item:hover:not(:disabled)) {
  filter: brightness(1.05);
}

:deep(.account-menu-copy) {
  border-top: 2px solid var(--border-strong);
  background: var(--surface-base);
  color: var(--fg-muted);
  text-transform: none;
}
</style>
