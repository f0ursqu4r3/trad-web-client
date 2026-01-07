<script lang="ts" setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useUiStore } from '@/stores/ui'

const accounts = useAccountsStore()
const ui = useUiStore()

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
      class="input-sm"
      v-model="accounts.selectedAccountId"
      :disabled="accounts.loading || accounts.accounts.length === 0"
    >
      <option v-if="accounts.loading" disabled>Loading...</option>
      <option v-else-if="accounts.accounts.length === 0" disabled>No accounts</option>
      <option v-for="acc in accounts.accounts" :key="acc.id" :value="acc.id">
        {{ acc.label }}
      </option>
    </select>
    <button v-else class="link-term" @click="ui.openSettings()">No accounts — configure</button>
  </div>
</template>
