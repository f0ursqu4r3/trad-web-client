<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useUiStore } from '@/stores/ui'

const accounts = useAccountsStore()
const ui = useUiStore()

const selectedAccount = computed(() => accounts.selectedAccount)
const accountColor = computed(() => {
  if (!selectedAccount.value) return 'var(--color-text-dim)'
  const palette = [
    '#56cfe1',
    '#5b8cff',
    '#3fd28c',
    '#f7a529',
    '#e45757',
    '#9d7bff',
    '#21b8c5',
    '#8bc34a',
    '#ff9f1c',
  ]
  const id = selectedAccount.value.id || selectedAccount.value.label
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 2147483647
  }
  return palette[Math.abs(hash) % palette.length]
})

function onKeyDown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey) {
    const key = event.key
    // 1-0 keys
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
    <select
      v-if="accounts.accounts.length > 0"
      class="input-sm account-select"
      v-model="accounts.selectedAccountId"
      :disabled="accounts.loading || accounts.accounts.length === 0"
      :style="{ '--account-color': accountColor }"
    >
      <option v-if="accounts.loading" disabled>Loading...</option>
      <option v-else-if="accounts.accounts.length === 0" disabled>No accounts</option>
      <option v-for="acc in accounts.accounts" :key="acc.id" :value="acc.id">
        {{ acc.label }} • {{ acc.exchange }} • {{ acc.network }}
      </option>
    </select>
    <button v-else class="link-term" @click="ui.openSettings()">No accounts — configure</button>
  </div>
</template>

<style scoped>
.account-select {
  min-width: 260px;
  border-radius: 0;
  background: color-mix(in srgb, var(--account-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--account-color) 65%, var(--border-color));
  border-left: 4px solid var(--account-color);
  padding-left: 0.5rem;
}
</style>
