<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Plus, RefreshCw } from 'lucide-vue-next'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
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

const accounts = useAccountsStore()
const route = useRoute()
const router = useRouter()
const query = ref('')
const createOpen = ref(false)
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
      <button class="btn btn-primary btn-sm" @click="createOpen = true">
        <Plus :size="13" /> New account
      </button>
    </template>

    <p v-if="accounts.error" class="control-notice">{{ accounts.error }}</p>
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
            <th class="w-24"></th>
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
              <div class="mt-0.5 text-[10px] dim">{{ account.id.slice(0, 8) }}</div>
            </td>
            <td>
              <div class="text-primary">{{ account.exchange }}</div>
              <div class="mt-0.5 text-[10px] dim">{{ account.network }}</div>
            </td>
            <td>{{ formatAccountProduct(account.exchange_metadata?.product) || '—' }}</td>
            <td>
              <span class="pill" :class="ready(account) ? 'pill-ok' : 'pill-warn'">
                {{ ready(account) ? 'ready' : 'setup required' }}
              </span>
              <div v-if="!ready(account)" class="mt-1 max-w-64 text-[10px] text-warning">
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
            <td class="text-right">
              <RouterLink
                :to="manageRoute(account)"
                class="btn btn-sm"
                :class="ready(account) ? 'btn-secondary' : 'btn-primary'"
                @click="accounts.selectedAccountId = account.id"
              >
                {{ ready(account) ? 'Manage' : 'Set up' }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="!accounts.loading" class="py-10 text-center">
      <p class="m-0 text-sm text-primary">
        {{
          accounts.accounts.length ? 'No accounts match this filter.' : 'No trading accounts yet.'
        }}
      </p>
      <p class="mx-auto mb-4 mt-2 max-w-lg text-[11px] leading-relaxed dim">
        Add an exchange account, then Trad will guide you through only the approvals and checks
        required to make it command-ready.
      </p>
      <button v-if="!accounts.accounts.length" class="btn btn-primary" @click="createOpen = true">
        Add account
      </button>
    </div>
  </ControlSection>
  <CreateAccountModal :open="createOpen" @close="createOpen = false" />
</template>

<style scoped>
.account-context-cell {
  box-shadow: inset 3px 0 0 var(--account-context-color);
  padding-left: 0.85rem;
}
</style>
