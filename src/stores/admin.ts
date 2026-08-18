import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiGet, apiPut } from '@/lib/apiClient'
import type { ExchangeAccountMetadata } from '@/stores/accounts'

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
  role: 'user' | 'admin'
  enabled: boolean
  entitlement_override: boolean | null
  subscription_status: string | null
  entitled: boolean
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
export interface ExecutionPolicy {
  hyperliquid_target_total_tenths_bps: number
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

export const useAdminStore = defineStore('admin', () => {
  const overview = ref<AdminOverview | null>(null)
  const users = ref<AdminUser[]>([])
  const accounts = ref<AdminAccount[]>([])
  const policy = ref<ExecutionPolicy | null>(null)
  const audit = ref<AuditEvent[]>([])
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
  const fetchPolicy = () =>
    load(
      () => apiGet<ExecutionPolicy>('/admin/execution-policy', { throwOnHTTPError: true }),
      (value) => (policy.value = value),
    )
  const fetchAudit = () =>
    load(
      () => apiGet<AuditEvent[]>('/admin/audit?limit=200', { throwOnHTTPError: true }),
      (value) => (audit.value = value),
    )
  async function updateUser(user: AdminUser) {
    await apiPut(
      `/admin/users/${user.user_id}`,
      { role: user.role, enabled: user.enabled, entitlement_override: user.entitlement_override },
      { throwOnHTTPError: true },
    )
    await fetchUsers()
  }
  async function updatePolicy(next: ExecutionPolicy) {
    policy.value = await apiPut('/admin/execution-policy', next, { throwOnHTTPError: true })
    await Promise.all([fetchAccounts(), fetchAudit()])
  }

  return {
    overview,
    users,
    accounts,
    policy,
    audit,
    loading,
    error,
    fetchOverview,
    fetchUsers,
    fetchAccounts,
    fetchPolicy,
    fetchAudit,
    updateUser,
    updatePolicy,
  }
})
