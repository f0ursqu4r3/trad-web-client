<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import { useAdminStore } from '@/stores/admin'

const admin = useAdminStore()
const globalTarget = ref('5.2')
const mainnetBuilder = ref('')
const testnetBuilder = ref('')
const saved = ref('')
const reportFilter = ref('')
const userDrafts = reactive<Record<string, string>>({})
const accountDrafts = reactive<Record<string, string>>({})

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

function totals(values: Record<string, string> | undefined): string {
  if (!values || Object.keys(values).length === 0) return '—'
  return Object.entries(values)
    .map(([asset, amount]) => `${amount} ${asset}`)
    .join(', ')
}

function populateDrafts(): void {
  for (const user of admin.users) {
    userDrafts[user.user_id] =
      user.builder_target_override_tenths_bps == null
        ? ''
        : String(user.builder_target_override_tenths_bps / 10)
  }
  for (const account of admin.accounts) {
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
    admin.fetchFeeReport(),
  ])
  if (admin.policy) {
    globalTarget.value = String(admin.policy.hyperliquid_target_total_tenths_bps / 10)
    mainnetBuilder.value = admin.policy.hyperliquid_mainnet_builder_address || ''
    testnetBuilder.value = admin.policy.hyperliquid_testnet_builder_address || ''
  }
  populateDrafts()
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
  const account = admin.accounts.find((entry) => entry.account_id === accountId)
  const target = account?.exchange_metadata?.builder_target_total_tenths_bps
  return target == null ? '—' : `${(target / 10).toFixed(1)} bps`
}

function currentUserTarget(userId: string): string {
  const user = admin.users.find((entry) => entry.user_id === userId)
  const target =
    user?.builder_target_override_tenths_bps ?? admin.policy?.hyperliquid_target_total_tenths_bps
  return target == null ? '—' : `${(target / 10).toFixed(1)} bps`
}

onMounted(refresh)
</script>

<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Fees"
    description="Set the all-in trading cost hierarchy independently from Stripe plans and venue authorization."
  />

  <ControlSection
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
    title="User defaults"
    description="Blank inherits the global default. Account overrides remain unchanged."
  >
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
          <tr v-for="user in admin.users" :key="user.user_id">
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
  </ControlSection>

  <ControlSection
    title="Trading-account overrides"
    description="Blank inherits that owner’s user default, then the global default."
  >
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
          <tr v-for="account in admin.accounts" :key="account.account_id">
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
  </ControlSection>

  <ControlSection
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
td small {
  display: block;
  color: var(--fg-muted);
}
</style>
