<script lang="ts" setup>
import { useAccountsStore } from '@/stores/accounts'

const accounts = useAccountsStore()
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
  </div>
</template>
