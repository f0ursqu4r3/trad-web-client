<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { accountMetadataChips, useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
import { X } from 'lucide-vue-next'
import { getBearerToken } from '@/lib/auth0Helpers'
import { createLogger } from '@/lib/utils'
import type { MarketCapabilitiesData, UserCommandPayload } from '@/lib/ws/protocol'

const logger = createLogger('accounts')

const accounts = useAccountsStore()
const ws = useWsStore()

const isCreateModalOpen = ref(false)
const refreshingAccountIds = ref<Set<string>>(new Set())
const requestedCapabilityAccountIds = ref<Set<string>>(new Set())
const refreshError = ref<string | null>(null)
const controlError = ref<string | null>(null)
const controlMessage = ref<string | null>(null)
const leverageForms = reactive<Record<string, { symbol: string; leverage: number }>>({})

const sortedAccounts = computed(() => {
  accounts.accounts.forEach(ensureLeverageForm)
  return accounts.accounts.slice().sort((a, b) => a.label.localeCompare(b.label))
})

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
  ensureLeverageForm(account)
  requestAccountCapabilities(account)
}

async function refreshAccounts() {
  await accounts.fetchAccounts()
  requestVisibleCapabilities()
}

async function refreshAccountKeys(account: AccountRecord) {
  refreshError.value = null
  if (ws.status !== 'ready') {
    refreshError.value = 'Account refresh requires an active server connection.'
    return
  }
  const token = await getBearerToken()
  if (!token) {
    refreshError.value = 'Unable to refresh account credentials: no auth token available.'
    return
  }
  refreshingAccountIds.value = new Set([...refreshingAccountIds.value, account.id])
  try {
    ws.sendRefreshAccountKeys(account.id, account.label, token)
  } finally {
    window.setTimeout(() => {
      const next = new Set(refreshingAccountIds.value)
      next.delete(account.id)
      refreshingAccountIds.value = next
    }, 3000)
  }
}

function ensureLeverageForm(account: AccountRecord) {
  if (leverageForms[account.id]) return
  leverageForms[account.id] = {
    symbol: accounts.getDefaultSymbolForAccount(account.id),
    leverage: 1,
  }
}

function marketContextForAccount(account: AccountRecord) {
  return accounts.getMarketContextForAccount(account.id)
}

function capabilitiesForAccount(account: AccountRecord): MarketCapabilitiesData | null {
  return ws.capabilitiesForMarketContext(marketContextForAccount(account))
}

function requestAccountCapabilities(account: AccountRecord) {
  if (ws.status !== 'ready') return
  const marketContext = marketContextForAccount(account)
  if (!marketContext) return
  requestedCapabilityAccountIds.value = new Set([
    ...requestedCapabilityAccountIds.value,
    account.id,
  ])
  ws.requestMarketCapabilities(marketContext)
}

function requestVisibleCapabilities() {
  if (ws.status !== 'ready') return
  for (const account of accounts.accounts) {
    requestAccountCapabilities(account)
  }
}

function capabilityStatus(account: AccountRecord): string {
  if (capabilitiesForAccount(account)) return 'Capabilities loaded'
  if (requestedCapabilityAccountIds.value.has(account.id)) return 'Capabilities pending'
  if (ws.status !== 'ready') return 'Server offline'
  return 'Capabilities not loaded'
}

function validateLeverage(account: AccountRecord): boolean {
  const capabilities = capabilitiesForAccount(account)
  const form = leverageForms[account.id]
  if (!capabilities?.supports_leverage) return false
  if (!form) return false
  if (!form.symbol.trim()) return false
  if (!Number.isFinite(form.leverage) || form.leverage <= 0) return false
  return ws.status === 'ready'
}

function canSetHedgeMode(account: AccountRecord): boolean {
  const capabilities = capabilitiesForAccount(account)
  return ws.status === 'ready' && !!capabilities?.supports_hedge_mode
}

function setLeverage(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  const marketContext = marketContextForAccount(account)
  const form = leverageForms[account.id]
  if (!marketContext || !form || !validateLeverage(account)) {
    controlError.value = 'Leverage settings are unavailable for this account.'
    return
  }
  const payload: Extract<UserCommandPayload, { kind: 'SetLeverage' }> = {
    kind: 'SetLeverage',
    data: {
      symbol: form.symbol.trim().toUpperCase(),
      leverage: form.leverage,
      market_context: marketContext,
    },
  }
  ws.sendUserCommand(payload)
  controlMessage.value = `Submitted leverage update for ${form.symbol.trim().toUpperCase()}.`
}

function enableHedgeMode(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  const marketContext = marketContextForAccount(account)
  if (!marketContext || !canSetHedgeMode(account)) {
    controlError.value = 'Hedge mode is unavailable for this account.'
    return
  }
  const payload: Extract<UserCommandPayload, { kind: 'SetHedgeMode' }> = {
    kind: 'SetHedgeMode',
    data: {
      enabled: true,
      market_context: marketContext,
    },
  }
  ws.sendUserCommand(payload)
  controlMessage.value = `Submitted hedge-mode enable for ${account.label}.`
}

onMounted(() => {
  if (!accounts.lastFetchedAt) {
    accounts.fetchAccounts().catch((err) => {
      logger.error('initial fetch failed', err)
    })
  }
  accounts.accounts.forEach(ensureLeverageForm)
  requestVisibleCapabilities()
})

watch(
  () => accounts.accounts.map((account) => account.id).join('|'),
  () => {
    accounts.accounts.forEach(ensureLeverageForm)
    requestVisibleCapabilities()
  },
)

watch(
  () => ws.status,
  () => {
    requestVisibleCapabilities()
  },
)
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
      <p v-if="refreshError" class="text-center text-xs text-error">
        {{ refreshError }}
      </p>
      <p v-if="controlError" class="text-center text-xs text-error">
        {{ controlError }}
      </p>
      <p v-if="controlMessage" class="text-center text-xs text-[var(--color-success)]">
        {{ controlMessage }}
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
            <div class="flex flex-1 flex-col gap-2">
              <button
                class="flex flex-col items-start gap-2 text-left"
                type="button"
                @click="selectAccount(account)"
                :aria-pressed="accounts.selectedAccountId === account.id"
              >
                <span class="text-sm font-medium text-primary">
                  {{ account.label }}
                </span>
                <span class="flex flex-wrap items-center gap-2 text-[11px] dim">
                  <span v-for="chip in accountMetadataChips(account)" :key="chip" class="chip">
                    {{ chip }}
                  </span>
                  <span
                    v-if="accounts.selectedAccountId === account.id"
                    class="pill pill-info text-[10px] uppercase tracking-[0.08em]"
                  >
                    Active
                  </span>
                  <span
                    v-if="accounts.selectedAccountId === account.id"
                    class="pill pill-xs text-[10px]"
                  >
                    {{ capabilityStatus(account) }}
                  </span>
                </span>
              </button>

              <div
                v-if="accounts.selectedAccountId === account.id"
                class="grid gap-2 border-t border-[var(--panel-border-inner)] pt-2 md:grid-cols-[minmax(96px,1fr)_96px_auto_auto]"
              >
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Symbol</span>
                  <input
                    v-model.trim="leverageForms[account.id].symbol"
                    class="input h-7 text-xs"
                    spellcheck="false"
                    @focus="ensureLeverageForm(account)"
                  />
                </label>
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Lev</span>
                  <input
                    v-model.number="leverageForms[account.id].leverage"
                    class="input h-7 text-xs"
                    type="number"
                    min="1"
                    step="1"
                    @focus="ensureLeverageForm(account)"
                  />
                </label>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!validateLeverage(account)"
                  @click="setLeverage(account)"
                >
                  Set Leverage
                </button>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canSetHedgeMode(account)"
                  @click="enableHedgeMode(account)"
                >
                  Enable Hedge
                </button>
              </div>
            </div>

            <button
              class="btn btn-secondary btn-xs"
              type="button"
              title="Refresh credentials and exchange metadata"
              :disabled="ws.status !== 'ready' || refreshingAccountIds.has(account.id)"
              @click="refreshAccountKeys(account)"
            >
              Refresh
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
