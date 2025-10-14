<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import type { GatewayAccount } from '@/lib/gatewayClient'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
import EditAccountModal from '@/components/terminal/modals/EditAccountModal.vue'

const accounts = useAccountsStore()

const isCreateModalOpen = ref(false)
const isEditModalOpen = ref(false)
const accountToEdit = ref<GatewayAccount | null>(null)

const sortedAccounts = computed(() =>
  accounts.accounts.slice().sort((a, b) => a.label.localeCompare(b.label)),
)

function openCreateModal() {
  isCreateModalOpen.value = true
}

function openEditModal(account: GatewayAccount) {
  accountToEdit.value = account
  isEditModalOpen.value = true
}

function closeEditModal() {
  isEditModalOpen.value = false
  accountToEdit.value = null
}

async function deleteAccount(account: GatewayAccount) {
  if (!window.confirm(`Delete account "${account.label}"? This cannot be undone.`)) return
  try {
    await accounts.removeAccount(account)
  } catch (err) {
    console.error('[accounts] delete failed', err)
  }
}

function selectAccount(account: GatewayAccount) {
  accounts.selectAccount(account.id)
}

async function refreshAccounts() {
  await accounts.fetchAccounts()
}

onMounted(() => {
  if (!accounts.lastFetchedAt) {
    accounts.fetchAccounts().catch((err) => {
      console.error('[accounts] initial fetch failed', err)
    })
  }
})
</script>

<template>
  <div class="accounts-panel">
    <header class="panel-header">
      <div class="title">
        <span>Trading Accounts</span>
        <span v-if="accounts.loading" class="pill pill-info">loading</span>
        <span v-else-if="accounts.error" class="pill pill-err">error</span>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-xs" @click="refreshAccounts" :disabled="accounts.loading">
          Refresh
        </button>
        <button class="btn btn-primary btn-xs" @click="openCreateModal">
          New
        </button>
      </div>
    </header>

    <div class="panel-body">
      <p v-if="accounts.error" class="error">{{ accounts.error }}</p>
      <p v-else-if="accounts.loading && accounts.accounts.length === 0" class="placeholder">
        Loading accounts...
      </p>
      <p v-else-if="accounts.accounts.length === 0" class="placeholder">
        No accounts configured yet.
      </p>
      <ul v-else class="accounts-list">
        <li
          v-for="account in sortedAccounts"
          :key="account.id"
          :class="['account-item', { active: accounts.selectedAccountId === account.id }]"
        >
          <button class="item-main" @click="selectAccount(account)">
            <div class="label">
              {{ account.label }}
            </div>
            <div class="meta">
              <span class="network">{{ account.network || account.meta?.network || 'Unknown' }}</span>
              <span v-if="accounts.selectedAccountId === account.id" class="status">active</span>
            </div>
          </button>
          <div class="item-actions">
            <button class="icon-btn" title="Edit" @click="openEditModal(account)">Edit</button>
            <button class="icon-btn" title="Delete" @click="deleteAccount(account)">Delete</button>
          </div>
        </li>
      </ul>
    </div>
    <CreateAccountModal :open="isCreateModalOpen" @close="isCreateModalOpen = false" />
    <EditAccountModal :open="isEditModalOpen" :account="accountToEdit" @close="closeEditModal" />
  </div>
</template>

<style scoped>
.accounts-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-dim);
}

.title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.panel-body {
  flex: 1;
  overflow: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.account-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--panel-bg) 85%, transparent);
  transition: border-color 120ms ease;
}

.account-item.active {
  border-color: var(--accent-color);
}

.item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem;
  text-align: left;
  color: inherit;
}

.item-main:hover {
  background: color-mix(in srgb, var(--accent-color) 18%, transparent);
}

.label {
  font-size: 13px;
  color: var(--color-text);
}

.meta {
  font-size: 11px;
  color: var(--color-text-dim);
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-right: 0.35rem;
}

.icon-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: var(--color-text-dim);
}

.icon-btn:hover {
  color: var(--color-text);
}

.status {
  color: var(--accent-color);
}

.pill {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: 10px;
  padding: 0.1rem 0.5rem;
}

.pill-info {
  background: color-mix(in srgb, var(--accent-color) 20%, transparent);
  color: var(--accent-color);
}

.pill-err {
  background: color-mix(in srgb, red 20%, transparent);
  color: #ff6b6b;
}

.error {
  color: #ff6b6b;
  font-size: 12px;
}

.placeholder {
  font-size: 12px;
  color: var(--color-text-dim);
}
</style>
