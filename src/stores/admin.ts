import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/apiClient'
import type { ExchangeAccountMetadata } from '@/stores/accounts'
import type { BillingInvoice, CommercialPlan, EffectiveEntitlement } from '@/stores/billing'

export interface AdminOverview {
  users: number
  enabled_users: number
  entitled_users: number
  trading_accounts: number
  hyperliquid_accounts: number
}
export interface AdminUser {
  user_id: string
  email: string
  role: 'user' | 'admin' | 'super_admin'
  enabled: boolean
  entitlement_override: boolean | null
  builder_target_override_tenths_bps: number | null
  subscription_status: string | null
  entitled: boolean
  entitlement_source: string
  plan_key: string | null
  plan_version: number | null
  account_count: number
  created_at: string
  last_login_at: string | null
}
export interface AdminAccount {
  account_id: string
  user_id: string
  email: string
  label: string
  exchange: string
  network: string
  configuration_revision: number
  exchange_metadata?: ExchangeAccountMetadata | null
}
export interface DirectoryPage<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}
export interface ExecutionPolicy {
  hyperliquid_target_total_tenths_bps: number
  hyperliquid_mainnet_builder_address: string | null
  hyperliquid_testnet_builder_address: string | null
  hyperliquid_approval_ceiling_tenths_bps: number
  version: number
}
export interface AuditEvent {
  id: number
  actor_user_id: string | null
  actor_email: string | null
  action: string
  target_type: string
  target_id: string
  detail: Record<string, unknown>
  created_at: string
}
export interface PriceBinding {
  stripe_account_id: string
  livemode: boolean
  stripe_price_id: string
  plan_key: string
  plan_version: number
  active: boolean
}
export interface EntitlementGrant {
  id: string
  user_id: string
  kind: 'complimentary' | 'deny'
  plan_key: string | null
  plan_version: number | null
  reason: string
  issued_by: string | null
  starts_at: string
  expires_at: string | null
  revoked_at: string | null
}
export interface UserEntitlementDetail {
  effective: EffectiveEntitlement
  grants: EntitlementGrant[]
  billing_customer: {
    stripe_customer_id: string
    default_payment_method: string | null
  } | null
  subscription: {
    stripe_subscription_id: string
    status: string
    price_id: string | null
    current_period_end: string | null
    trial_end: string | null
    cancel_at: string | null
    canceled_at: string | null
  } | null
  invoices: BillingInvoice[]
  account_count: number
}
export interface BillingOperation {
  id: string
  idempotency_key: string
  user_id: string
  kind: string
  state: string
  request: Record<string, unknown>
  stripe_object_id: string | null
  error: string | null
  created_at: string
}
export interface FeeReport {
  totals: {
    reported_total: Record<string, string>
    trad_builder: Record<string, string>
    exchange_ex_builder: Record<string, string>
  }
  fills: Array<{
    event_id: string
    user_id: string
    email: string
    account_id: string
    account_label: string
    symbol: string
    command_id: string | null
    phase: string
    liquidity_role: string | null
    quantity: string
    price: string
    fee_asset: string | null
    reported_total_fee: string | null
    trad_builder_fee: string | null
    exchange_fee_ex_builder: string | null
    actual_all_in_tenths_bps: string | null
    pinned_all_in_target_tenths_bps: number | null
    policy_source: string | null
    policy_version: number | null
    occurred_at_millis: number
  }>
  policy_drift: Array<{
    command_id: string
    user_id: string
    email: string
    account_id: string
    account_label: string
    pinned_all_in_target_tenths_bps: number
    pinned_source: string
    pinned_policy_version: number
    current_all_in_target_tenths_bps: number
    current_source: string | null
    accepted_at_millis: number
  }>
}

export const useAdminStore = defineStore('admin', () => {
  const overview = ref<AdminOverview | null>(null)
  const users = ref<AdminUser[]>([])
  const accounts = ref<AdminAccount[]>([])
  const feeUsers = ref<DirectoryPage<AdminUser>>({ items: [], total: 0, limit: 50, offset: 0 })
  const feeAccounts = ref<DirectoryPage<AdminAccount>>({
    items: [],
    total: 0,
    limit: 50,
    offset: 0,
  })
  const policy = ref<ExecutionPolicy | null>(null)
  const feeReport = ref<FeeReport | null>(null)
  const audit = ref<AuditEvent[]>([])
  const commercialPlans = ref<CommercialPlan[]>([])
  const priceBindings = ref<PriceBinding[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load<T>(request: () => Promise<T>, assign: (value: T) => void) {
    loading.value = true
    error.value = null
    try {
      assign(await request())
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading.value = false
    }
  }
  const fetchOverview = () =>
    load(
      () => apiGet<AdminOverview>('/admin/overview', { throwOnHTTPError: true }),
      (value) => (overview.value = value),
    )
  const fetchUsers = () =>
    load(
      () => apiGet<AdminUser[]>('/admin/users', { throwOnHTTPError: true }),
      (value) => (users.value = value),
    )
  const fetchAccounts = () =>
    load(
      () => apiGet<AdminAccount[]>('/admin/accounts', { throwOnHTTPError: true }),
      (value) => (accounts.value = value),
    )
  const fetchFeeUsers = (query = '', offset = 0) =>
    load(
      () =>
        apiGet<DirectoryPage<AdminUser>>(
          `/admin/fee-users?q=${encodeURIComponent(query)}&limit=50&offset=${offset}`,
          { throwOnHTTPError: true },
        ),
      (value) => (feeUsers.value = value),
    )
  const fetchFeeAccounts = (query = '', offset = 0, owner = '') =>
    load(
      () =>
        apiGet<DirectoryPage<AdminAccount>>(
          `/admin/fee-accounts?q=${encodeURIComponent(query)}&limit=50&offset=${offset}${owner ? `&owner=${encodeURIComponent(owner)}` : ''}`,
          { throwOnHTTPError: true },
        ),
      (value) => (feeAccounts.value = value),
    )
  const fetchPolicy = () =>
    load(
      () => apiGet<ExecutionPolicy>('/admin/execution-policy', { throwOnHTTPError: true }),
      (value) => (policy.value = value),
    )
  const fetchFeeReport = () =>
    load(
      () => apiGet<FeeReport>('/admin/fee-report', { throwOnHTTPError: true }),
      (value) => (feeReport.value = value),
    )
  const fetchAudit = () =>
    load(
      () => apiGet<AuditEvent[]>('/admin/audit?limit=200', { throwOnHTTPError: true }),
      (value) => (audit.value = value),
    )
  const fetchCommercialPlans = () =>
    load(
      () => apiGet<CommercialPlan[]>('/admin/commercial-plans', { throwOnHTTPError: true }),
      (value) => (commercialPlans.value = value),
    )
  const fetchPriceBindings = () =>
    load(
      () => apiGet<PriceBinding[]>('/admin/stripe-price-bindings', { throwOnHTTPError: true }),
      (value) => (priceBindings.value = value),
    )
  const fetchUserEntitlement = (userId: string) =>
    apiGet<UserEntitlementDetail>(`/admin/users/${userId}/entitlement`, {
      throwOnHTTPError: true,
    })
  async function createGrant(
    userId: string,
    request: {
      kind: 'complimentary' | 'deny'
      plan_key?: string
      plan_version?: number
      reason: string
      expires_at?: string
    },
  ) {
    await apiPost(`/admin/users/${userId}/grants`, request, { throwOnHTTPError: true })
  }
  async function revokeGrant(grantId: string) {
    await apiDelete(`/admin/grants/${grantId}`, { throwOnHTTPError: true })
  }
  const fetchBillingOperations = (userId: string) =>
    apiGet<BillingOperation[]>(`/admin/users/${userId}/billing-operations`, {
      throwOnHTTPError: true,
    })
  async function executeBillingOperation(userId: string, request: Record<string, unknown>) {
    const idempotencyKey = crypto.randomUUID()
    return apiPost<BillingOperation>(`/admin/users/${userId}/billing-operations`, request, {
      throwOnHTTPError: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    })
  }
  async function createCommercialPlan(plan: CommercialPlan, changeReason: string) {
    await apiPost(
      '/admin/commercial-plans',
      { plan, change_reason: changeReason },
      {
        throwOnHTTPError: true,
      },
    )
    await fetchCommercialPlans()
  }
  async function putPriceBinding(binding: PriceBinding) {
    await apiPut('/admin/stripe-price-bindings', binding, { throwOnHTTPError: true })
    await fetchPriceBindings()
  }
  async function updateUser(user: AdminUser) {
    await apiPut(
      `/admin/users/${user.user_id}`,
      { role: user.role, enabled: user.enabled, entitlement_override: user.entitlement_override },
      { throwOnHTTPError: true },
    )
    await fetchUsers()
  }
  async function updateUserBuilderTarget(userId: string, target: number | null) {
    return apiPut<EffectiveEntitlement>(
      `/admin/users/${userId}/builder-target`,
      { builder_target_override_tenths_bps: target },
      { throwOnHTTPError: true },
    )
  }
  async function updateAccountAllInTarget(accountId: string, target: number | null) {
    const account = await apiPut<AdminAccount>(
      `/admin/accounts/${accountId}/all-in-target`,
      { target_total_tenths_bps: target },
      { throwOnHTTPError: true },
    )
    const index = accounts.value.findIndex((entry) => entry.account_id === accountId)
    if (index >= 0) accounts.value[index] = account
    return account
  }
  async function updatePolicy(next: ExecutionPolicy) {
    policy.value = await apiPut('/admin/execution-policy', next, { throwOnHTTPError: true })
    await Promise.all([fetchAccounts(), fetchAudit()])
  }

  return {
    overview,
    users,
    accounts,
    feeUsers,
    feeAccounts,
    policy,
    feeReport,
    audit,
    commercialPlans,
    priceBindings,
    loading,
    error,
    fetchOverview,
    fetchUsers,
    fetchAccounts,
    fetchFeeUsers,
    fetchFeeAccounts,
    fetchPolicy,
    fetchFeeReport,
    fetchAudit,
    fetchCommercialPlans,
    fetchPriceBindings,
    fetchUserEntitlement,
    createGrant,
    revokeGrant,
    fetchBillingOperations,
    executeBillingOperation,
    createCommercialPlan,
    putPriceBinding,
    updateUser,
    updateUserBuilderTarget,
    updateAccountAllInTarget,
    updatePolicy,
  }
})
