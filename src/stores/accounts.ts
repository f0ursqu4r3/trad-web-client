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

  const ACCOUNT_ORDER_STORAGE_KEY = 'trad-account-order'

  const accountsRaw = ref<ApiKeyRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedAccountId = ref<string | null>(null)
  const lastFetchedAt = ref<number | null>(null)
  const accountOrder = ref<string[]>([])

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(ACCOUNT_ORDER_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as unknown
        if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) {
          accountOrder.value = parsed
        }
      }
    } catch (error) {
      console.warn('Failed to hydrate account order from storage', error)
    }
  }

  const accounts = computed(() => {
    const list = accountsRaw.value
    if (!accountOrder.value.length) {
      return [...list]
    }

    const orderMap = new Map(accountOrder.value.map((id, index) => [id, index]))
    const baseIndex = orderMap.size
    const incomingIndex = new Map(list.map((item, index) => [item.id, index]))

    return [...list].sort((a, b) => {
      const orderA = orderMap.get(a.id) ?? baseIndex + (incomingIndex.get(a.id) ?? 0)
      const orderB = orderMap.get(b.id) ?? baseIndex + (incomingIndex.get(b.id) ?? 0)
      return orderA - orderB
    })
  })

  const selectedAccount = computed(
    () => accounts.value.find((a) => a.id === selectedAccountId.value) ?? null,
  )
  const hasAccounts = computed(() => accounts.value.length > 0)

  async function fetchAccounts(): Promise<void> {
    const response = await apiGet<ApiKeyRecord[]>('/accounts')
    accountsRaw.value = response

    const fetchedIds = new Set(response.map((account) => account.id))
    accountOrder.value = accountOrder.value.filter((id) => fetchedIds.has(id))

    for (const account of response) {
      if (!accountOrder.value.includes(account.id)) {
        accountOrder.value.push(account.id)
      }
    }

    if (accounts.value.length === 0) {
      selectedAccountId.value = null
    } else if (
      !selectedAccountId.value ||
      !accounts.value.some((a) => a.id === selectedAccountId.value)
    ) {
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

  function reorderAccounts(nextOrder: ApiKeyRecord[]): void {
    const nextIds = nextOrder.map((account) => account.id)
    const existingMap = new Map(accountsRaw.value.map((account) => [account.id, account]))
    const seen = new Set<string>()
    const reordered: ApiKeyRecord[] = []

    for (const id of nextIds) {
      const match = existingMap.get(id)
      if (match) {
        reordered.push(match)
        seen.add(id)
      }
    }

    for (const account of accountsRaw.value) {
      if (!seen.has(account.id)) {
        reordered.push(account)
      }
    }

    accountsRaw.value = reordered
    accountOrder.value = reordered.map((account) => account.id)

    if (selectedAccountId.value) {
      const exists = accounts.value.some((account) => account.id === selectedAccountId.value)
      if (!exists) {
        selectedAccountId.value = accounts.value[0]?.id ?? null
      }
    } else if (accounts.value.length > 0) {
      selectedAccountId.value = accounts.value[0].id
    }
  }

  watch(
    accountOrder,
    (order) => {
      if (typeof window === 'undefined') return
      if (!order.length) {
        window.localStorage.removeItem(ACCOUNT_ORDER_STORAGE_KEY)
        return
      }
      try {
        window.localStorage.setItem(ACCOUNT_ORDER_STORAGE_KEY, JSON.stringify(order))
      } catch (error) {
        console.warn('Failed to persist account order', error)
      }
    },
    { deep: true },
  )

  watch(
    () => isAuthenticated.value,
    (authed) => {
      if (authed) {
        fetchAccounts().catch((err) => {
          error.value = err instanceof Error ? err.message : String(err)
        })
      } else {
        accountsRaw.value = []
        accountOrder.value = []
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
    reorderAccounts,
  }
})
