<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const globalTarget = ref('5.2')
const mainnetBuilder = ref('')
const testnetBuilder = ref('')
const saved = ref('')
const reportFilter = ref('')
const userFilter = ref('')
const accountFilter = ref('')
const auditFilter = ref('')
const activeTab = ref<'overview' | 'users' | 'accounts' | 'active' | 'revenue' | 'audit'>(
  'overview',
)
const selectedUserId = ref<string | null>(null)
const selectedAccountId = ref<string | null>(null)
const accountOwnerId = ref('')
const userDrafts = reactive<Record<string, string>>({})
const accountDrafts = reactive<Record<string, string>>({})
const tabs = [
  ['overview', 'Overview'],
  ['users', 'Users'],
  ['accounts', 'Accounts'],
  ['active', 'Active trade policy'],
  ['revenue', 'Revenue & fees'],
  ['audit', 'Audit'],
] as const

function tenthsBps(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 6_553.5) return null
  return Math.round(parsed * 10)
}

const globalValid = computed(() => tenthsBps(globalTarget.value) !== null)
const reportRows = computed(() => {
  const needle = reportFilter.value.trim().toLowerCase()
  if (!needle) return admin.feeReport?.fills ?? []
  return (admin.feeReport?.fills ?? []).filter((fill) =>
    [fill.email, fill.account_label, fill.symbol, fill.phase, fill.liquidity_role]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  )
})
const filteredUsers = computed(() => {
  return admin.feeUsers.items
})
const filteredAccounts = computed(() => {
  return admin.feeAccounts.items
})
const selectedUser = computed(() =>
  admin.feeUsers.items.find((user) => user.user_id === selectedUserId.value),
)
const selectedAccount = computed(() =>
  admin.feeAccounts.items.find((account) => account.account_id === selectedAccountId.value),
)
const feeAuditRows = computed(() => {
  const needle = auditFilter.value.trim().toLowerCase()
  return admin.audit.filter((event) => {
    const feeRelated =
      event.action.toLowerCase().includes('fee') ||
      event.action.toLowerCase().includes('builder') ||
      event.target_type.toLowerCase().includes('execution_policy')
    if (!feeRelated) return false
    if (!needle) return true
    return [event.actor_email ?? '', event.action, event.target_type, event.target_id].some(
      (value) => value.toLowerCase().includes(needle),
    )
  })
})

function totals(values: Record<string, string> | undefined): string {
  if (!values || Object.keys(values).length === 0) return '—'
  return Object.entries(values)
    .map(([asset, amount]) => `${amount} ${asset}`)
    .join(', ')
}

function populateDrafts(): void {
  for (const user of admin.feeUsers.items) {
    userDrafts[user.user_id] =
      user.builder_target_override_tenths_bps == null
        ? ''
        : String(user.builder_target_override_tenths_bps / 10)
  }
  for (const account of admin.feeAccounts.items) {
    accountDrafts[account.account_id] =
      account.exchange_metadata?.builder_target_override_tenths_bps == null
        ? ''
        : String(account.exchange_metadata.builder_target_override_tenths_bps / 10)
  }
}

async function refresh(): Promise<void> {
  await Promise.all([
    admin.fetchPolicy(),
    admin.fetchUsers(),
    admin.fetchAccounts(),
    admin.fetchFeeUsers(),
    admin.fetchFeeAccounts(),
    admin.fetchFeeReport(),
    admin.fetchAudit(),
  ])
  if (admin.policy) {
    globalTarget.value = String(admin.policy.hyperliquid_target_total_tenths_bps / 10)
    mainnetBuilder.value = admin.policy.hyperliquid_mainnet_builder_address || ''
    testnetBuilder.value = admin.policy.hyperliquid_testnet_builder_address || ''
  }
  populateDrafts()
  selectedUserId.value ??= admin.feeUsers.items[0]?.user_id ?? null
  selectedAccountId.value ??= admin.feeAccounts.items[0]?.account_id ?? null
}

async function saveGlobal(): Promise<void> {
  const target = tenthsBps(globalTarget.value)
  if (target === null) return
  saved.value = ''
  await admin.updatePolicy({
    hyperliquid_target_total_tenths_bps: target,
    hyperliquid_mainnet_builder_address: mainnetBuilder.value || null,
    hyperliquid_testnet_builder_address: testnetBuilder.value || null,
    hyperliquid_approval_ceiling_tenths_bps: 100,
    version: admin.policy?.version || 1,
  })
  saved.value = admin.error ? '' : 'Global fee policy saved.'
  await refresh()
}

async function saveUser(userId: string): Promise<void> {
  const raw = userDrafts[userId] ?? ''
  const target = raw.trim() === '' ? null : tenthsBps(raw)
  if (raw.trim() !== '' && target === null) return
  await admin.updateUserBuilderTarget(userId, target)
  saved.value = 'User all-in default saved.'
  await refresh()
}

async function saveAccount(accountId: string): Promise<void> {
  const raw = accountDrafts[accountId] ?? ''
  const target = raw.trim() === '' ? null : tenthsBps(raw)
  if (raw.trim() !== '' && target === null) return
  await admin.updateAccountAllInTarget(accountId, target)
  saved.value = 'Account all-in override saved.'
  await refresh()
}

function currentTarget(accountId: string): string {
  const account = admin.feeAccounts.items.find((entry) => entry.account_id === accountId)
  const target = account?.exchange_metadata?.builder_target_total_tenths_bps
  return target == null ? '—' : `${(target / 10).toFixed(1)} bps`
}

function currentUserTarget(userId: string): string {
  const user = admin.feeUsers.items.find((entry) => entry.user_id === userId)
  const target =
    user?.builder_target_override_tenths_bps ?? admin.policy?.hyperliquid_target_total_tenths_bps
  return target == null ? '—' : `${(target / 10).toFixed(1)} bps`
}

function showUserAccounts(): void {
  if (!selectedUser.value) return
  accountFilter.value = ''
  accountOwnerId.value = selectedUser.value.user_id
  activeTab.value = 'accounts'
  void admin.fetchFeeAccounts('', 0, accountOwnerId.value).then(populateDrafts)
}

function clearAccountOwner(): void {
  accountOwnerId.value = ''
  void admin.fetchFeeAccounts(accountFilter.value, 0).then(populateDrafts)
}

let userSearchTimer: ReturnType<typeof setTimeout> | undefined
let accountSearchTimer: ReturnType<typeof setTimeout> | undefined
watch(userFilter, (value) => {
  clearTimeout(userSearchTimer)
  userSearchTimer = setTimeout(() => {
    void admin.fetchFeeUsers(value, 0).then(populateDrafts)
  }, 250)
})
watch(accountFilter, (value) => {
  clearTimeout(accountSearchTimer)
  accountSearchTimer = setTimeout(() => {
    accountOwnerId.value = ''
    void admin.fetchFeeAccounts(value, 0).then(populateDrafts)
  }, 250)
})
onUnmounted(() => {
  clearTimeout(userSearchTimer)
  clearTimeout(accountSearchTimer)
})

onMounted(refresh)
</script>

<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Fees"
    description="Set the all-in trading cost hierarchy independently from Stripe plans and venue authorization."
  />

  <nav class="fee-tabs" aria-label="Fee administration">
    <button
      v-for="tab in tabs"
      :key="tab[0]"
      class="fee-tab"
      :class="{ active: activeTab === tab[0] }"
      type="button"
      @click="activeTab = tab[0]"
    >
      {{ tab[1] }}
    </button>
  </nav>

  <ControlSection
    v-if="activeTab === 'overview'"
    title="All-in fee authority"
    description="Account override → user default → global default. Blank values inherit the next level."
  >
    <div class="control-detail-grid">
      <div><span>Hyperliquid builder capability</span><strong>10.0 bps maximum</strong></div>
      <div><span>Wallet approval</span><strong>10.0 bps one-time ceiling</strong></div>
      <div><span>Configured values mean</span><strong>Exchange fee + Trad builder fee</strong></div>
      <div><span>Active trades</span><strong>Pinned to their accepted policy snapshot</strong></div>
    </div>
    <p class="control-notice">
      The 10.0 bps venue capability limits only Trad’s builder component. It does not cap the all-in
      target. Trad derives the builder component from the live maker or taker fee and never charges
      more than the approved venue maximum.
    </p>
  </ControlSection>

  <ControlSection
    v-if="activeTab === 'overview'"
    title="Global default"
    description="Inherited by users without an explicit default."
  >
    <div class="control-form-grid max-w-3xl">
      <label class="field">
        <span>All-in total per side (bps)</span>
        <input v-model="globalTarget" class="input" inputmode="decimal" />
        <span v-if="!globalValid" class="field-error">Enter a non-negative decimal value.</span>
      </label>
      <label class="field">
        <span>Mainnet builder recipient</span>
        <input v-model.trim="mainnetBuilder" class="input" placeholder="0x…" />
      </label>
      <label class="field">
        <span>Testnet builder recipient</span>
        <input v-model.trim="testnetBuilder" class="input" placeholder="Optional 0x…" />
      </label>
    </div>
    <div class="control-actions">
      <button class="btn btn-primary" :disabled="!globalValid || admin.loading" @click="saveGlobal">
        Save global default
      </button>
    </div>
  </ControlSection>

  <ControlSection
    v-if="activeTab === 'users'"
    title="User defaults"
    description="Blank inherits the global default. Account overrides remain unchanged."
  >
    <input
      v-model="userFilter"
      class="input entity-filter"
      placeholder="Search email, user ID, or role"
    />
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[760px]">
        <thead>
          <tr>
            <th>User</th>
            <th>Current all-in</th>
            <th>User default / side</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in filteredUsers"
            :key="user.user_id"
            :class="{ selected: selectedUserId === user.user_id }"
            @click="selectedUserId = user.user_id"
          >
            <td>{{ user.email }}</td>
            <td>{{ currentUserTarget(user.user_id) }}</td>
            <td>
              <input
                v-model="userDrafts[user.user_id]"
                class="input fee-input"
                inputmode="decimal"
                placeholder="inherit"
              />
            </td>
            <td>
              {{
                user.builder_target_override_tenths_bps == null ? 'global default' : 'user default'
              }}
            </td>
            <td><button class="btn btn-xs" @click="saveUser(user.user_id)">save</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="directory-pager">
      <span
        >{{ admin.feeUsers.offset + 1 }}–{{
          Math.min(admin.feeUsers.offset + admin.feeUsers.items.length, admin.feeUsers.total)
        }}
        of {{ admin.feeUsers.total }}</span
      >
      <button
        class="btn btn-xs"
        :disabled="admin.feeUsers.offset === 0"
        @click="
          admin
            .fetchFeeUsers(userFilter, Math.max(0, admin.feeUsers.offset - admin.feeUsers.limit))
            .then(populateDrafts)
        "
      >
        previous
      </button>
      <button
        class="btn btn-xs"
        :disabled="admin.feeUsers.offset + admin.feeUsers.items.length >= admin.feeUsers.total"
        @click="
          admin
            .fetchFeeUsers(userFilter, admin.feeUsers.offset + admin.feeUsers.limit)
            .then(populateDrafts)
        "
      >
        next
      </button>
    </div>
    <div v-if="selectedUser" class="entity-detail">
      <div>
        <span>Selected user</span><strong>{{ selectedUser.email }}</strong>
      </div>
      <div>
        <span>Resolved new-trade target</span
        ><strong>{{ currentUserTarget(selectedUser.user_id) }}</strong>
      </div>
      <div>
        <span>Owned accounts</span><strong>{{ selectedUser.account_count }}</strong>
      </div>
      <button class="btn btn-xs" type="button" @click="showUserAccounts">
        View this user’s accounts
      </button>
    </div>
  </ControlSection>

  <ControlSection
    v-if="activeTab === 'accounts'"
    title="Trading-account overrides"
    description="Blank inherits that owner’s user default, then the global default."
  >
    <input
      v-model="accountFilter"
      class="input entity-filter"
      placeholder="Search owner, label, account ID, exchange, or network"
    />
    <button
      v-if="accountOwnerId"
      class="btn btn-xs clear-owner"
      type="button"
      @click="clearAccountOwner"
    >
      Show every owner
    </button>
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[900px]">
        <thead>
          <tr>
            <th>Owner</th>
            <th>Account</th>
            <th>Network</th>
            <th>Current all-in target</th>
            <th>Override / side</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="account in filteredAccounts"
            :key="account.account_id"
            :class="{ selected: selectedAccountId === account.account_id }"
            @click="selectedAccountId = account.account_id"
          >
            <td>{{ account.email }}</td>
            <td>{{ account.label }}</td>
            <td>{{ account.network }}</td>
            <td>{{ currentTarget(account.account_id) }}</td>
            <td>
              <input
                v-model="accountDrafts[account.account_id]"
                class="input fee-input"
                inputmode="decimal"
                placeholder="inherit"
              />
            </td>
            <td>
              <button class="btn btn-xs" @click="saveAccount(account.account_id)">save</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="directory-pager">
      <span
        >{{ admin.feeAccounts.offset + 1 }}–{{
          Math.min(
            admin.feeAccounts.offset + admin.feeAccounts.items.length,
            admin.feeAccounts.total,
          )
        }}
        of {{ admin.feeAccounts.total }}</span
      >
      <button
        class="btn btn-xs"
        :disabled="admin.feeAccounts.offset === 0"
        @click="
          admin
            .fetchFeeAccounts(
              accountFilter,
              Math.max(0, admin.feeAccounts.offset - admin.feeAccounts.limit),
              accountOwnerId,
            )
            .then(populateDrafts)
        "
      >
        previous
      </button>
      <button
        class="btn btn-xs"
        :disabled="
          admin.feeAccounts.offset + admin.feeAccounts.items.length >= admin.feeAccounts.total
        "
        @click="
          admin
            .fetchFeeAccounts(
              accountFilter,
              admin.feeAccounts.offset + admin.feeAccounts.limit,
              accountOwnerId,
            )
            .then(populateDrafts)
        "
      >
        next
      </button>
    </div>
    <div v-if="selectedAccount" class="entity-detail">
      <div>
        <span>Selected account</span><strong>{{ selectedAccount.label }}</strong>
      </div>
      <div>
        <span>Owner</span><strong>{{ selectedAccount.email }}</strong>
      </div>
      <div>
        <span>Resolved target</span><strong>{{ currentTarget(selectedAccount.account_id) }}</strong>
      </div>
      <div>
        <span>Source</span
        ><strong>{{
          selectedAccount.exchange_metadata?.builder_target_source ?? 'inherited'
        }}</strong>
      </div>
    </div>
  </ControlSection>

  <ControlSection
    v-if="activeTab === 'active'"
    title="Pinned active policies"
    description="Active command lifecycles whose accepted all-in target differs from the account’s current setting. Existing work keeps the pinned value."
  >
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[760px]">
        <thead>
          <tr>
            <th>User / account</th>
            <th>Accepted</th>
            <th>Pinned all-in</th>
            <th>Current all-in</th>
            <th>Command</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in admin.feeReport?.policy_drift ?? []" :key="row.command_id">
            <td>
              {{ row.email }}<small>{{ row.account_label }}</small>
            </td>
            <td>{{ new Date(row.accepted_at_millis).toLocaleString() }}</td>
            <td>
              {{ (row.pinned_all_in_target_tenths_bps / 10).toFixed(1) }} bps<small
                >{{ row.pinned_source }} · v{{ row.pinned_policy_version }}</small
              >
            </td>
            <td>
              {{ (row.current_all_in_target_tenths_bps / 10).toFixed(1) }} bps<small>{{
                row.current_source ?? 'unknown source'
              }}</small>
            </td>
            <td>{{ row.command_id.slice(0, 8) }}</td>
          </tr>
          <tr v-if="(admin.feeReport?.policy_drift.length ?? 0) === 0">
            <td colspan="5">No active policy differences.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>

  <ControlSection
    v-if="activeTab === 'revenue'"
    title="Actual fee ledger"
    description="Durable exchange fills. Hyperliquid’s reported total already includes the Trad builder component."
  >
    <div class="control-detail-grid">
      <div>
        <span>Reported all-in fees</span
        ><strong>{{ totals(admin.feeReport?.totals.reported_total) }}</strong>
      </div>
      <div>
        <span>Trad builder revenue</span
        ><strong>{{ totals(admin.feeReport?.totals.trad_builder) }}</strong>
      </div>
      <div>
        <span>Exchange component</span
        ><strong>{{ totals(admin.feeReport?.totals.exchange_ex_builder) }}</strong>
      </div>
      <div>
        <span>Report rows</span><strong>{{ admin.feeReport?.fills.length ?? 0 }}</strong>
      </div>
    </div>
    <input
      v-model="reportFilter"
      class="input report-filter"
      placeholder="Filter by user, account, symbol, phase, or liquidity"
    />
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[1120px]">
        <thead>
          <tr>
            <th>Time</th>
            <th>User / account</th>
            <th>Symbol</th>
            <th>Phase</th>
            <th>Liquidity</th>
            <th>Exchange</th>
            <th>Trad</th>
            <th>Actual all-in</th>
            <th>Pinned target</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="fill in reportRows" :key="fill.event_id">
            <td>{{ new Date(fill.occurred_at_millis).toLocaleString() }}</td>
            <td>
              {{ fill.email }}<small>{{ fill.account_label }}</small>
            </td>
            <td>{{ fill.symbol }}</td>
            <td>{{ fill.phase }}</td>
            <td>{{ fill.liquidity_role ?? 'unknown' }}</td>
            <td>{{ fill.exchange_fee_ex_builder ?? '—' }} {{ fill.fee_asset ?? '' }}</td>
            <td>{{ fill.trad_builder_fee ?? '—' }} {{ fill.fee_asset ?? '' }}</td>
            <td>
              {{
                fill.actual_all_in_tenths_bps == null
                  ? '—'
                  : `${(Number(fill.actual_all_in_tenths_bps) / 10).toFixed(3)} bps`
              }}
            </td>
            <td>
              {{
                fill.pinned_all_in_target_tenths_bps == null
                  ? 'legacy / unknown'
                  : `${(fill.pinned_all_in_target_tenths_bps / 10).toFixed(1)} bps`
              }}
              <small v-if="fill.policy_source"
                >{{ fill.policy_source }} · v{{ fill.policy_version }}</small
              >
            </td>
          </tr>
          <tr v-if="reportRows.length === 0">
            <td colspan="9">No matching durable fills.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>

  <ControlSection
    v-if="activeTab === 'audit'"
    title="Fee policy audit"
    description="Immutable global, user, account, approval, and builder-policy mutations."
  >
    <input
      v-model="auditFilter"
      class="input entity-filter"
      placeholder="Filter by actor, action, target type, or target ID"
    />
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[900px]">
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in feeAuditRows" :key="event.id">
            <td>{{ new Date(event.created_at).toLocaleString() }}</td>
            <td>{{ event.actor_email ?? 'system' }}</td>
            <td>{{ event.action }}</td>
            <td>
              {{ event.target_type }}<small>{{ event.target_id }}</small>
            </td>
            <td>
              <code>{{ JSON.stringify(event.detail) }}</code>
            </td>
          </tr>
          <tr v-if="feeAuditRows.length === 0">
            <td colspan="5">No matching fee mutations.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>

  <p v-if="saved" class="notice-ok">{{ saved }}</p>
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>

<style scoped>
.fee-input {
  min-width: 9rem;
  max-width: 13rem;
}
.report-filter {
  width: min(36rem, 100%);
  margin: 0.75rem 0;
}
.fee-tabs {
  display: flex;
  gap: 0;
  margin: 0 0 1rem;
  overflow-x: auto;
  border-bottom: 1px solid var(--border-default);
}
.fee-tab {
  padding: 0.7rem 0.9rem;
  color: var(--fg-muted);
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
}
.fee-tab.active {
  color: var(--fg-strong);
  border-bottom-color: var(--accent-color);
}
.entity-filter {
  width: min(42rem, 100%);
  margin-bottom: 0.75rem;
}
.directory-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.65rem;
  color: var(--fg-muted);
}
.clear-owner {
  margin: 0 0 0.75rem 0.5rem;
}
.entity-detail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 1px;
  margin-top: 0.85rem;
  background: var(--border-subtle);
  border: 1px solid var(--border-subtle);
}
.entity-detail > * {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem;
  background: var(--surface-sunken);
}
.entity-detail span {
  color: var(--fg-muted);
}
tbody tr.selected {
  background: var(--surface-selected);
}
td small {
  display: block;
  color: var(--fg-muted);
}
</style>
