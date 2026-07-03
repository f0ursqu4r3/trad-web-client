<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  accountMetadataChips,
  accountMetadataStatus,
  isBybitMetadataVerified,
  useAccountsStore,
  type AccountRecord,
} from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
import { X } from 'lucide-vue-next'
import { getWebSocketToken } from '@/lib/auth'
import { isValidBybitUsdtSymbol, normalizeBybitUsdtSymbol } from '@/lib/bybitOrderValidation'
import { createLogger } from '@/lib/utils'
import {
  ExchangeType,
  type MarketCapabilitiesData,
  type OrderThrottleSnapshotData,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

const logger = createLogger('accounts')

const accounts = useAccountsStore()
const ws = useWsStore()

const isCreateModalOpen = ref(false)
const refreshingAccountIds = ref<Set<string>>(new Set())
const requestedCapabilityAccountIds = ref<Set<string>>(new Set())
const refreshError = ref<string | null>(null)
const controlError = ref<string | null>(null)
const controlMessage = ref<string | null>(null)
const leverageForms = reactive<Record<string, { symbols: string; leverage: number }>>({})
let throttleRefreshTimer: number | null = null

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
  requestAccountThrottle(account)
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
  const token = await getWebSocketToken()
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
    symbols: accounts.getDefaultSymbolForAccount(account.id),
    leverage: 1,
  }
}

function marketContextForAccount(account: AccountRecord) {
  return accounts.getMarketContextForAccount(account.id)
}

function capabilitiesForAccount(account: AccountRecord): MarketCapabilitiesData | null {
  return ws.capabilitiesForMarketContext(marketContextForAccount(account))
}

function throttleForAccount(account: AccountRecord): OrderThrottleSnapshotData | null {
  return ws.orderThrottleForMarketContext(marketContextForAccount(account))
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

function requestAccountThrottle(account: AccountRecord) {
  if (ws.status !== 'ready') return
  const marketContext = marketContextForAccount(account)
  if (!marketContext) return
  ws.requestOrderThrottleSnapshot(marketContext)
}

function requestVisibleCapabilities() {
  if (ws.status !== 'ready') return
  for (const account of accounts.accounts) {
    requestAccountCapabilities(account)
  }
}

function requestSelectedThrottle() {
  const account = accounts.selectedAccount
  if (!account) return
  requestAccountThrottle(account)
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
  const symbols = parseLeverageSymbols(account, form.symbols)
  if (symbols.length === 0) return false
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
  const symbols = parseLeverageSymbols(account, form.symbols)
  for (const symbol of symbols) {
    const payload: Extract<UserCommandPayload, { kind: 'SetLeverage' }> = {
      kind: 'SetLeverage',
      data: {
        symbol,
        leverage: form.leverage,
        market_context: marketContext,
      },
    }
    ws.sendUserCommand(payload)
  }
  controlMessage.value =
    symbols.length === 1
      ? `Submitted leverage update for ${symbols[0]}.`
      : `Submitted leverage updates for ${symbols.length} symbols: ${summarizeSymbols(symbols)}.`
}

function parseLeverageSymbols(account: AccountRecord, raw: string): string[] {
  const tokens = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const symbols = tokens
    .map((token) => {
      if (account.exchange === ExchangeType.Bybit) {
        return isValidBybitUsdtSymbol(token) ? normalizeBybitUsdtSymbol(token) : ''
      }
      return token.toUpperCase()
    })
    .filter(Boolean)

  return [...new Set(symbols)]
}

function summarizeSymbols(symbols: string[]): string {
  const shown = symbols.slice(0, 4).join(', ')
  return symbols.length > 4 ? `${shown}, ...` : shown
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
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
  requestSelectedThrottle()
  throttleRefreshTimer = window.setInterval(requestSelectedThrottle, 2000)
})

onUnmounted(() => {
  if (throttleRefreshTimer != null) {
    window.clearInterval(throttleRefreshTimer)
    throttleRefreshTimer = null
  }
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
    requestSelectedThrottle()
  },
)

watch(
  () => accounts.selectedAccountId,
  () => {
    requestSelectedThrottle()
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
                <span
                  v-if="accountMetadataStatus(account)"
                  class="text-[11px]"
                  :class="isBybitMetadataVerified(account) ? 'text-[var(--color-success)]' : 'text-warning'"
                >
                  {{ accountMetadataStatus(account) }}
                </span>
              </button>

              <div
                v-if="accounts.selectedAccountId === account.id"
                class="grid gap-2 border-t border-[var(--panel-border-inner)] pt-2 md:grid-cols-[minmax(132px,1fr)_96px_auto_auto]"
              >
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>{{ account.exchange === ExchangeType.Bybit ? 'Symbols' : 'Symbol' }}</span>
                  <input
                    v-model.trim="leverageForms[account.id].symbols"
                    class="input h-7 text-xs"
                    spellcheck="false"
                    :placeholder="
                      account.exchange === ExchangeType.Bybit
                        ? 'BTC, ETH, SOL'
                        : 'BTCUSDT or ALL'
                    "
                    @focus="ensureLeverageForm(account)"
                  />
                  <span
                    v-if="account.exchange === ExchangeType.Bybit"
                    class="normal-case tracking-normal text-[var(--color-text-dim)]"
                  >
                    Comma or space separated; applied per symbol.
                  </span>
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
              <div
                v-if="accounts.selectedAccountId === account.id"
                class="grid gap-2 text-[10px] uppercase tracking-[0.06em] dim sm:grid-cols-4"
              >
                <div class="flex flex-col gap-1">
                  <span>Queue</span>
                  <span class="font-mono text-primary">
                    {{ throttleForAccount(account)?.total_queued ?? 0 }} queued /
                    {{ throttleForAccount(account)?.total_in_flight ?? 0 }} live
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Oldest</span>
                  <span class="font-mono text-primary">
                    {{ formatMs(throttleForAccount(account)?.accounts[0]?.oldest_queued_age_ms) }}
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Drain Est</span>
                  <span class="font-mono text-primary">
                    {{ formatMs(throttleForAccount(account)?.accounts[0]?.estimated_drain_ms) }}
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Errors</span>
                  <span class="font-mono text-primary">
                    {{ throttleForAccount(account)?.errored_total ?? 0 }} err /
                    {{ throttleForAccount(account)?.canceled_total ?? 0 }} cancel
                  </span>
                </div>
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
