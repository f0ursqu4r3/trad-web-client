import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiPut, apiGet, apiDelete } from '@/lib/apiClient'

export interface AccountFormPayload {
  label: string
  apiKey: string
  secretKey: string
  network: string
}

export interface ApiKeyRecord {
  id: string
  label: string
  key: string
  network?: 'mainnet' | 'testnet' | string
  exchange?: 'binance' | string
}

export const useAccountsStore = defineStore('accounts', () => {
  const { isAuthenticated } = useAuth0()

  const accounts = ref<ApiKeyRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedAccountId = ref<string | null>(null)
  const lastFetchedAt = ref<number | null>(null)

  const selectedAccount = computed(
    () => accounts.value.find((a) => a.id === selectedAccountId.value) ?? null,
  )
  const hasAccounts = computed(() => accounts.value.length > 0)

  async function fetchAccounts(): Promise<void> {
    const response = await apiGet<ApiKeyRecord[]>('/accounts')
    accounts.value = response
    if (!selectedAccountId.value && accounts.value.length > 0) {
      selectedAccountId.value = accounts.value[0].id
    }
    lastFetchedAt.value = Date.now()
  }

  async function addAccount(payload: AccountFormPayload): Promise<void> {
    const label = encodeURIComponent(payload.label.trim())
    const resp = await apiPut(`/accounts/${label}`, {
      label: payload.label,
      key: payload.apiKey,
      secret: payload.secretKey,
      network: payload.network,
      exchange: 'binance',
    })
    console.log('Add account response:', resp)
    await fetchAccounts()
  }

  async function removeAccount(label: string): Promise<void> {
    const encodedLabel = encodeURIComponent(label)
    await apiDelete(`/accounts/${encodedLabel}`)
    await fetchAccounts()
  }

  watch(
    () => isAuthenticated.value,
    (authed) => {
      if (authed) {
        fetchAccounts().catch((err) => {
          error.value = err instanceof Error ? err.message : String(err)
        })
      } else {
        accounts.value = []
        selectedAccountId.value = null
        error.value = null
        lastFetchedAt.value = null
      }
    },
    { immediate: true },
  )

  return {
    // state
    accounts,
    loading,
    error,
    selectedAccountId,
    selectedAccount,
    hasAccounts,
    lastFetchedAt,
    // actions
    fetchAccounts,
    addAccount,
    removeAccount,
  }
})
