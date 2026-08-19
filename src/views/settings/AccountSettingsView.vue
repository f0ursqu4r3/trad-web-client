<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import AccountsListPanel from '@/components/terminal/panels/AccountsListPanel.vue'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import { accountMetadataStatus, isBybitMetadataVerified, useAccountsStore } from '@/stores/accounts'
import { accountColorFromId } from '@/lib/accountColors'
import { ExchangeType } from '@/lib/ws/protocol'

type AccountSection = 'overview' | 'setup' | 'defaults' | 'safety' | 'authorization' | 'danger'

const route = useRoute()
const accounts = useAccountsStore()
const accountId = computed(() => String(route.params.accountId || ''))
const account = computed(
  () => accounts.accounts.find((item) => item.id === accountId.value) ?? null,
)
const section = computed<AccountSection>(() =>
  ['overview', 'setup', 'defaults', 'safety', 'authorization', 'danger'].includes(
    String(route.params.accountSection),
  )
    ? (String(route.params.accountSection) as AccountSection)
    : 'overview',
)
const color = computed(() => accountColorFromId(accountId.value))
const setupSteps = computed(() => {
  if (!account.value) return []
  if (account.value.exchange !== ExchangeType.Hyperliquid) {
    return [
      {
        label: 'Exchange permissions',
        complete: isBybitMetadataVerified(account.value),
      },
    ]
  }
  const metadata = account.value.exchange_metadata
  return [
    { label: 'Account identity', complete: Boolean(metadata?.user_address) },
    { label: 'Agent wallet', complete: metadata?.agent_approved === true },
    { label: 'Builder ceiling', complete: metadata?.builder_approved === true },
  ]
})
const tabs: { key: AccountSection; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'setup', label: 'Setup' },
  { key: 'defaults', label: 'Trading defaults' },
  { key: 'safety', label: 'Execution safety' },
  { key: 'authorization', label: 'Authorization' },
  { key: 'danger', label: 'Danger zone' },
]

function selectCurrent() {
  if (account.value) accounts.selectedAccountId = account.value.id
}

onMounted(async () => {
  await accounts.fetchAccounts()
  selectCurrent()
})
watch(account, selectCurrent)
</script>

<template>
  <div class="account-workspace" :style="{ '--account-context-color': color }">
    <RouterLink to="/settings/accounts" class="account-back-link">
      <ArrowLeft :size="13" /> All accounts
    </RouterLink>
    <ControlPageHeader
      eyebrow="Trading account"
      :title="account?.label || 'Account unavailable'"
      :description="
        account
          ? `${account.exchange} · ${account.network} · ${accountMetadataStatus(account) || 'Configuration available.'}`
          : 'This account may have been removed or is not available to this user.'
      "
    />

    <template v-if="account">
      <nav class="account-tabs" aria-label="Account management">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.key"
          :to="`/settings/accounts/${account.id}/${tab.key}`"
          class="account-tab"
          :class="{ active: section === tab.key, danger: tab.key === 'danger' }"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>

      <div v-if="section === 'setup'" class="account-section-intro">
        <strong>Required setup only</strong>
        <span
          >Finish wallet permissions and approvals here. Trading preferences live in their own
          sections.</span
        >
      </div>
      <div v-else-if="section === 'authorization'" class="account-section-intro">
        <strong>Wallet authorization</strong>
        <span
          >The agent signs orders. The builder address is read-only platform identity; your wallet
          approves its fee ceiling.</span
        >
      </div>
      <div
        v-else-if="section === 'danger'"
        class="account-section-intro account-section-intro--danger"
      >
        <strong>Destructive maintenance</strong>
        <span
          >Trad refuses deletion while exchange positions, orders, protections, or unresolved
          executions remain.</span
        >
      </div>

      <ol v-if="section === 'setup'" class="account-setup-steps">
        <li
          v-for="(step, index) in setupSteps"
          :key="step.label"
          :class="{ complete: step.complete }"
        >
          <span class="account-step-number">{{ index + 1 }}</span>
          <span>{{ step.label }}</span>
          <span class="pill" :class="step.complete ? 'pill-ok' : 'pill-warn'">
            {{ step.complete ? 'complete' : 'required' }}
          </span>
        </li>
      </ol>

      <AccountsListPanel mode="detail" :detail-account-id="account.id" :detail-section="section" />
    </template>
    <div v-else-if="accounts.loading" class="panel-card p-6 text-sm dim">Loading account…</div>
    <div v-else class="panel-card p-6">
      <p class="m-0 text-sm text-primary">Account not found.</p>
      <RouterLink to="/settings/accounts" class="btn btn-secondary mt-4"
        >Return to accounts</RouterLink
      >
    </div>
  </div>
</template>

<style scoped>
.account-workspace :deep(.control-section-header),
.account-workspace :deep(.panel-card) {
  border-top-color: var(--account-context-color);
}
.account-workspace :deep(.panel-card) {
  border-top-width: 2px;
}
.account-back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.8rem;
  color: var(--fg-muted);
  font-size: 11px;
}
.account-back-link:hover {
  color: var(--fg-strong);
}
.account-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  padding: 0.3rem;
  overflow-x: auto;
  border: 1px solid var(--border-normal);
  background: var(--surface-base);
}
.account-tab {
  flex: 0 0 auto;
  padding: 0.5rem 0.7rem;
  border-left: 2px solid transparent;
  color: var(--fg-muted);
  font-size: 11px;
}
.account-tab:hover {
  background: var(--row-hover-bg);
  color: var(--fg-strong);
}
.account-tab.active {
  border-left-color: var(--account-context-color);
  background: color-mix(in srgb, var(--account-context-color) 10%, var(--surface-muted));
  color: var(--fg-strong);
}
.account-tab.danger.active {
  border-left-color: var(--state-error);
}
.account-section-intro {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-left: 3px solid var(--account-context-color);
  background: color-mix(in srgb, var(--account-context-color) 7%, var(--surface-base));
  font-size: 11px;
}
.account-section-intro strong {
  flex: 0 0 auto;
  color: var(--fg-strong);
}
.account-section-intro span {
  color: var(--fg-muted);
}
.account-section-intro--danger {
  border-left-color: var(--state-error);
  background: color-mix(in srgb, var(--state-error) 6%, var(--surface-base));
}
.account-setup-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.5rem;
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}
.account-setup-steps li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.55rem;
  min-height: 46px;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border-normal);
  background: var(--surface-base);
  color: var(--fg);
  font-size: 11px;
}
.account-setup-steps li.complete {
  border-color: color-mix(in srgb, var(--state-success) 35%, var(--border-normal));
}
.account-step-number {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid var(--border-normal);
  color: var(--fg-muted);
  font-size: 10px;
}
.complete .account-step-number {
  border-color: var(--state-success);
  color: var(--state-success);
}
</style>
