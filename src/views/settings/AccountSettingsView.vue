<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import AccountsListPanel from '@/components/terminal/panels/AccountsListPanel.vue'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import {
  accountMetadataStatus,
  isBybitMetadataVerified,
  isHyperliquidMetadataReady,
  useAccountsStore,
} from '@/stores/accounts'
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
const setupComplete = computed(() => {
  if (!account.value) return false
  if (account.value.exchange === ExchangeType.Hyperliquid) {
    return isHyperliquidMetadataReady(account.value)
  }
  if (account.value.exchange === ExchangeType.Bybit) {
    return isBybitMetadataVerified(account.value)
  }
  return true
})
const accountAddress = computed(() => {
  const value = account.value?.exchange_metadata?.user_address || account.value?.key || ''
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}…${value.slice(-6)}`
})
const tabs: { key: AccountSection; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'setup', label: 'Setup' },
  { key: 'defaults', label: 'Trading defaults' },
  { key: 'safety', label: 'Execution safety' },
  { key: 'authorization', label: 'Authorization' },
  { key: 'danger', label: 'Danger zone' },
]
const sectionTransition = ref('account-section-forward')

function selectCurrent() {
  if (account.value) accounts.selectedAccountId = account.value.id
}

onMounted(async () => {
  await accounts.fetchAccounts()
  selectCurrent()
})
watch(account, selectCurrent)
watch(section, (next, previous) => {
  const nextIndex = tabs.findIndex((tab) => tab.key === next)
  const previousIndex = tabs.findIndex((tab) => tab.key === previous)
  sectionTransition.value =
    nextIndex < previousIndex ? 'account-section-backward' : 'account-section-forward'
})
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
          ? `${account.exchange} · ${account.network}${accountAddress ? ` · ${accountAddress}` : ''} · ${accountMetadataStatus(account) || 'Configuration available.'}`
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

      <Transition :name="sectionTransition" mode="out-in">
        <section :key="section" class="account-section-view">
          <div v-if="section === 'setup' && !setupComplete" class="account-section-intro">
            <strong>Guided account setup</strong>
            <span
              >Follow the highlighted step. Trad will show exactly which wallet action is required
              next.</span
            >
          </div>
          <div v-else-if="section === 'authorization'" class="account-section-intro">
            <strong>Wallet authorization</strong>
            <span
              >The agent signs orders. The builder address is read-only platform identity; your
              wallet approves its fee ceiling.</span
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

          <AccountsListPanel
            mode="detail"
            :detail-account-id="account.id"
            :detail-section="section"
          />
        </section>
      </Transition>
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
.account-workspace {
  position: relative;
  padding-left: 0.8rem;
}
.account-workspace::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: 2px;
  background: var(--account-context-color);
  content: '';
}
.account-back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.8rem;
  color: var(--fg-muted);
  font-size: 13px;
}
.account-back-link:hover {
  color: var(--fg-strong);
}
.account-tabs {
  display: flex;
  align-items: end;
  gap: 0.2rem;
  margin-bottom: 0.9rem;
  padding: 0 0.45rem;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-subtle);
}
.account-tab {
  flex: 0 0 auto;
  margin-bottom: -1px;
  padding: 0.55rem 0.75rem 0.5rem;
  border: 1px solid transparent;
  border-bottom-color: var(--border-normal);
  border-radius: 4px 4px 0 0;
  color: var(--fg-muted);
  font-size: 13px;
  transition:
    color 120ms ease,
    background-color 120ms ease,
    transform 120ms ease;
}
.account-tab:hover {
  background: var(--row-hover-bg);
  color: var(--fg-strong);
  transform: translateY(-1px);
}
.account-tab.active {
  border-color: var(--border-normal);
  border-top-color: var(--accent-color);
  border-bottom-color: var(--surface-canvas);
  background: var(--surface-canvas);
  box-shadow: inset 0 2px 0 var(--accent-color);
  color: var(--fg-strong);
  transform: none;
}
.account-tab.danger.active {
  border-top-color: var(--state-error);
  box-shadow: inset 0 2px 0 var(--state-error);
}
.account-section-intro {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-left: 3px solid var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 6%, var(--surface-base));
  font-size: 13px;
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
.account-section-forward-enter-active,
.account-section-forward-leave-active,
.account-section-backward-enter-active,
.account-section-backward-leave-active {
  transition:
    opacity 110ms ease,
    transform 110ms ease;
}
.account-section-forward-enter-from {
  opacity: 0;
  transform: translateX(6px);
}
.account-section-forward-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}
.account-section-backward-enter-from {
  opacity: 0;
  transform: translateX(-6px);
}
.account-section-backward-leave-to {
  opacity: 0;
  transform: translateX(4px);
}
@media (prefers-reduced-motion: reduce) {
  .account-tab,
  .account-section-forward-enter-active,
  .account-section-forward-leave-active,
  .account-section-backward-enter-active,
  .account-section-backward-leave-active {
    transition: none;
  }
}
</style>
