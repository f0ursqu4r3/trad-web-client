<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Plus, RefreshCw, SquarePen, Trash2, WalletCards } from 'lucide-vue-next'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
import ActionConfirmationModal from '@/components/terminal/modals/ActionConfirmationModal.vue'
import {
  accountMetadataStatus,
  formatAccountProduct,
  isBybitMetadataVerified,
  isHyperliquidMetadataReady,
  useAccountsStore,
  type AccountRecord,
} from '@/stores/accounts'
import { accountColorFromId } from '@/lib/accountColors'
import { ExchangeType } from '@/lib/ws/protocol'
import GuidedPointer from '@/components/general/GuidedPointer.vue'
import PanelEmptyState from '@/components/general/PanelEmptyState.vue'
import DetachedHyperliquidConnections from '@/components/settings/DetachedHyperliquidConnections.vue'
import type { HyperliquidAgentConnection } from '@/lib/gateway/hyperliquidAgentConnections'

const accounts = useAccountsStore()
const route = useRoute()
const router = useRouter()
const query = ref('')
const createOpen = ref(false)
const reconnectTarget = ref<HyperliquidAgentConnection | null>(null)
const detachedConnections = ref<{ refresh: () => Promise<void> } | null>(null)
const deletionTarget = ref<AccountRecord | null>(null)
const deletingAccountIds = ref<Set<string>>(new Set())
const deletionError = ref<string | null>(null)
const deletionMessage = ref<string | null>(null)
const touringToNewAccount = computed(() => route.query.tour === 'new-account')
const rows = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return accounts.accounts.filter((account) =>
    `${account.label} ${account.exchange} ${account.network} ${formatAccountProduct(account.exchange_metadata?.product) || ''}`
      .toLowerCase()
      .includes(needle),
  )
})

function ready(account: AccountRecord): boolean {
  if (account.exchange === ExchangeType.Hyperliquid) return isHyperliquidMetadataReady(account)
  if (account.exchange === ExchangeType.Bybit) return isBybitMetadataVerified(account)
  return true
}

function agentStatus(account: AccountRecord): string {
  if (account.exchange !== ExchangeType.Hyperliquid) return 'not required'
  return account.exchange_metadata?.agent_approved ? 'approved' : 'required'
}

function builderStatus(account: AccountRecord): string {
  if (account.exchange !== ExchangeType.Hyperliquid) return 'not required'
  return account.exchange_metadata?.builder_approved ? 'approved' : 'required'
}

function manageRoute(account: AccountRecord): string {
  return `/settings/accounts/${account.id}/${ready(account) ? 'overview' : 'setup'}`
}

function finishAccountTour(): void {
  openAccountCreation()
  const query = { ...route.query }
  delete query.tour
  void router.replace({ query })
}

function openAccountCreation(connection: HyperliquidAgentConnection | null = null): void {
  reconnectTarget.value = connection
  createOpen.value = true
}

function closeAccountCreation(): void {
  createOpen.value = false
  reconnectTarget.value = null
}

function openCreatedAccount(account: AccountRecord): void {
  closeAccountCreation()
  void detachedConnections.value?.refresh()
  accounts.selectedAccountId = account.id
  void router.push(`/settings/accounts/${account.id}/${ready(account) ? 'overview' : 'setup'}`)
}

function requestAccountDeletion(account: AccountRecord): void {
  deletionError.value = null
  deletionMessage.value = null
  deletionTarget.value = account
}

async function confirmAccountDeletion(): Promise<void> {
  const account = deletionTarget.value
  if (!account) return
  deletionTarget.value = null
  deletingAccountIds.value = new Set(deletingAccountIds.value).add(account.id)
  deletionMessage.value = `Checking ${account.label} against the live exchange before deletion…`
  try {
    const result = await accounts.removeAccount(account.label)
    deletionMessage.value =
      result.owner_release === 'completed'
        ? `Deleted ${account.label}.`
        : `Deleted ${account.label}; owner cleanup is completing in the background.`
  } catch (error) {
    deletionMessage.value = null
    deletionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    const next = new Set(deletingAccountIds.value)
    next.delete(account.id)
    deletingAccountIds.value = next
    void detachedConnections.value?.refresh()
  }
}

onMounted(async () => {
  await accounts.fetchAccounts()
  if (route.query.create === '1') {
    createOpen.value = true
    const query = { ...route.query }
    delete query.create
    void router.replace({ query })
  }
})
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Trading accounts"
    description="Add accounts, finish required setup, and manage each account in its own workspace."
  />
  <ControlSection
    title="Accounts"
    :description="`${rows.length} of ${accounts.accounts.length} shown`"
  >
    <template #actions>
      <input
        v-model.trim="query"
        class="input control-filter h-8 text-xs"
        placeholder="Filter accounts"
      />
      <button
        class="btn btn-secondary btn-sm"
        :disabled="accounts.loading"
        @click="accounts.fetchAccounts()"
      >
        <RefreshCw :size="13" /> Refresh
      </button>
      <button class="btn btn-primary btn-sm" data-tour="new-account" @click="openAccountCreation()">
        <Plus :size="13" /> New account
      </button>
    </template>

    <p v-if="accounts.error || deletionError" class="control-notice control-notice--error">
      {{ deletionError || accounts.error }}
    </p>
    <p v-if="deletionMessage" class="control-notice">{{ deletionMessage }}</p>
    <div v-if="rows.length" class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[880px]" data-testid="account-settings-index">
        <thead>
          <tr>
            <th>Account</th>
            <th>Venue</th>
            <th>Product</th>
            <th>Readiness</th>
            <th>Agent</th>
            <th>Builder</th>
            <th class="w-24 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="account in rows"
            :key="account.id"
            :style="{ '--account-context-color': accountColorFromId(account.id) }"
          >
            <td class="account-context-cell">
              <div class="font-medium text-primary">{{ account.label }}</div>
              <div class="mt-0.5 text-[11px] dim">{{ account.id.slice(0, 8) }}</div>
            </td>
            <td>
              <div class="text-primary">{{ account.exchange }}</div>
              <div class="mt-0.5 text-[11px] dim">{{ account.network }}</div>
            </td>
            <td>{{ formatAccountProduct(account.exchange_metadata?.product) || '—' }}</td>
            <td>
              <span class="pill" :class="ready(account) ? 'pill-ok' : 'pill-warn'">
                {{ ready(account) ? 'ready' : 'setup required' }}
              </span>
              <div v-if="!ready(account)" class="mt-1 max-w-64 text-[12px] text-warning">
                {{ accountMetadataStatus(account) }}
              </div>
            </td>
            <td>
              <span :class="agentStatus(account) === 'required' ? 'text-warning' : 'dim'">
                {{ agentStatus(account) }}
              </span>
            </td>
            <td>
              <span :class="builderStatus(account) === 'required' ? 'text-warning' : 'dim'">
                {{ builderStatus(account) }}
              </span>
            </td>
            <td>
              <div class="account-row-actions">
                <RouterLink
                  :to="manageRoute(account)"
                  class="account-row-action"
                  :aria-label="
                    ready(account) ? `Manage ${account.label}` : `Set up ${account.label}`
                  "
                  :title="ready(account) ? 'Manage account' : 'Finish account setup'"
                  @click="accounts.selectedAccountId = account.id"
                >
                  <SquarePen :size="14" />
                </RouterLink>
                <button
                  type="button"
                  class="account-row-action account-row-action--danger"
                  :aria-label="`Delete ${account.label}`"
                  title="Delete account"
                  :disabled="deletingAccountIds.has(account.id)"
                  @click="requestAccountDeletion(account)"
                >
                  <RefreshCw
                    v-if="deletingAccountIds.has(account.id)"
                    :size="14"
                    class="animate-spin"
                  />
                  <Trash2 v-else :size="14" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PanelEmptyState
      v-else-if="!accounts.loading"
      :title="accounts.accounts.length ? 'No matching accounts' : 'No trading accounts yet'"
      :description="
        accounts.accounts.length
          ? 'Try a different account filter.'
          : 'Add an exchange account, then Trad will guide you through the approvals and checks required to make it command-ready.'
      "
    >
      <template #icon><WalletCards :size="20" /></template>
      <template v-if="!accounts.accounts.length" #action>
        <button class="btn btn-primary" @click="openAccountCreation()">Add account</button>
      </template>
    </PanelEmptyState>
  </ControlSection>
  <DetachedHyperliquidConnections ref="detachedConnections" @reconnect="openAccountCreation" />
  <GuidedPointer
    v-if="touringToNewAccount"
    source-selector="[data-tour='trading-accounts']"
    target-selector="[data-tour='new-account']"
    @arrive="finishAccountTour"
  />
  <CreateAccountModal
    :open="createOpen"
    :hyperliquid-prefill="
      reconnectTarget
        ? { network: reconnectTarget.network, userAddress: reconnectTarget.user_address }
        : null
    "
    @close="closeAccountCreation"
    @created="openCreatedAccount"
  />
  <ActionConfirmationModal
    :open="deletionTarget !== null"
    title="Delete trading account"
    :message="
      deletionTarget
        ? `Delete ${deletionTarget.label}? Trad will first reconcile the exchange and will refuse deletion if any position, order, protection, unresolved execution, or pending exchange action remains. Encrypted credentials are erased only after those checks pass.`
        : ''
    "
    confirm-label="Check and delete"
    @cancel="deletionTarget = null"
    @confirm="confirmAccountDeletion"
  />
</template>

<style scoped>
.account-context-cell {
  box-shadow: inset 3px 0 0 var(--account-context-color);
  padding-left: 0.85rem;
}
.account-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
}
.account-row-action {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  color: var(--fg-muted);
}
.account-row-action:hover {
  border-color: var(--border-normal);
  background: var(--row-hover-bg);
  color: var(--fg-strong);
}
.account-row-action--danger {
  color: var(--state-error);
}
.account-row-action--danger:hover {
  border-color: color-mix(in srgb, var(--state-error) 45%, var(--border-normal));
  background: color-mix(in srgb, var(--state-error) 8%, transparent);
  color: var(--state-error);
}
.account-row-action:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
</style>
