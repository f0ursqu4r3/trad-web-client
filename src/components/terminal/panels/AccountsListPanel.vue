<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
import { X } from 'lucide-vue-next'
import { createLogger } from '@/lib/utils'

const logger = createLogger('accounts')

const accounts = useAccountsStore()

const isCreateModalOpen = ref(false)

const sortedAccounts = computed(() =>
  accounts.accounts.slice().sort((a, b) => a.label.localeCompare(b.label)),
)

function openCreateModal() {
  isCreateModalOpen.value = true
}

async function deleteAccount(account: AccountRecord) {
  if (!window.confirm(`Delete account "${account.label}"? This cannot be undone.`)) return
  try {
    await accounts.removeAccount(account.label)
  } catch (err) {
    logger.error('delete failed', err)
  }
}

function selectAccount(account: AccountRecord) {
  accounts.selectedAccountId = account.id
}

async function refreshAccounts() {
  await accounts.fetchAccounts()
}

onMounted(() => {
  if (!accounts.lastFetchedAt) {
    accounts.fetchAccounts().catch((err) => {
      logger.error('initial fetch failed', err)
    })
  }
})
</script>

<template>
  <section class="panel-card flex h-full flex-col">
    <div class="panel-header-row">
      <div class="inline-flex items-center gap-2">
        <span class="font-semibold tracking-[0.04em] text-primary">Trading Accounts</span>
        <span v-if="accounts.loading" class="pill pill-info">loading</span>
        <span v-else-if="accounts.error" class="pill pill-err">error</span>
      </div>
      <div class="inline-flex items-center gap-2">
        <button
          class="btn btn-secondary btn-xs"
          @click="refreshAccounts"
          :disabled="accounts.loading"
        >
          Refresh
        </button>
        <button class="btn btn-primary btn-xs" @click="openCreateModal">New</button>
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-3 overflow-auto p-3">
      <p v-if="accounts.error" class="text-center text-xs text-error">
        {{ accounts.error }}
      </p>

      <p
        v-else-if="accounts.loading && accounts.accounts.length === 0"
        class="text-center text-xs dim"
      >
        Loading accounts...
      </p>

      <p v-else-if="accounts.accounts.length === 0" class="text-center text-xs dim">
        No accounts configured yet.
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="account in sortedAccounts"
          :key="account.id"
          :class="[
            'flex items-center gap-2 border border-[var(--panel-border-inner)] bg-[color-mix(in_srgb,var(--panel-bg)_95%,transparent)] transition-colors',
            {
              'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_18%,var(--panel-bg))]':
                accounts.selectedAccountId === account.id,
            },
          ]"
          :style="{ borderRadius: 'var(--radius-base)' }"
        >
          <div class="flex flex-1 items-center justify-between gap-3 px-3 py-2">
            <button
              class="flex flex-1 flex-col items-start gap-2 text-left"
              type="button"
              @click="selectAccount(account)"
              :aria-pressed="accounts.selectedAccountId === account.id"
            >
              <span class="text-sm font-medium text-primary">
                {{ account.label }}
              </span>
              <span class="flex items-center gap-2 text-[11px] dim">
                <span class="chip">{{ account.network || 'Unknown' }}</span>
                <span
                  v-if="accounts.selectedAccountId === account.id"
                  class="pill pill-info text-[10px] uppercase tracking-[0.08em]"
                >
                  Active
                </span>
              </span>
            </button>

            <button
              class="btn icon-btn btn-sm"
              type="button"
              title="Delete"
              @click="deleteAccount(account)"
            >
              <X :size="12" />
            </button>
          </div>
        </li>
      </ul>
    </div>
    <CreateAccountModal :open="isCreateModalOpen" @close="isCreateModalOpen = false" />
  </section>
</template>
