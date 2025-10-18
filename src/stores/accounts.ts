import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiPut, apiGet, apiDelete } from '@/lib/apiClient'
import { ExchangeType, type MarketContext, type NetworkType } from '@/lib/ws/protocol'

export interface AccountFormPayload {
  label: string
  key: string
  secret: string
  network: NetworkType
  exchange: ExchangeType
}

export interface AccountRecord {
  id: string
  label: string
  key: string
  network: NetworkType
  exchange: ExchangeType
}

export const useAccountsStore = defineStore(
  'accounts',
  () => {
    const { isAuthenticated } = useAuth0()

    const accountsRaw = ref<AccountRecord[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)
    const selectedAccountId = ref<string | null>(null)
    const lastFetchedAt = ref<number | null>(null)
    const accountOrder = ref<string[]>([])

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
      const response = await apiGet<AccountRecord[]>('/accounts')
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
      const resp = await apiPut(`/accounts/${label}`, payload)
      console.log('Add account response:', resp)
      await fetchAccounts()
    }

    async function removeAccount(label: string): Promise<void> {
      const encodedLabel = encodeURIComponent(label)
      await apiDelete(`/accounts/${encodedLabel}`)
      await fetchAccounts()
    }

    function reorderAccounts(nextOrder: AccountRecord[]): void {
      const nextIds = nextOrder.map((account) => account.id)
      const existingMap = new Map(accountsRaw.value.map((account) => [account.id, account]))
      const seen = new Set<string>()
      const reordered: AccountRecord[] = []

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

    function getMarketContextForAccount(accountId: string): MarketContext | null {
      const account = accounts.value.find((a) => a.id === accountId)
      if (!account) return null
      return {
        [account.exchange]: {
          account_id: account.id,
        },
      }
    }

    watch(
      () => isAuthenticated.value,
      (authed) => {
        if (!authed) {
          accountsRaw.value = []
          error.value = null
          lastFetchedAt.value = null
        }
      },
      { immediate: true },
    )

    return {
      // state
      accountsRaw,
      accounts,
      accountOrder,
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
      getMarketContextForAccount,
    }
  },
  {
    persist: {
      key: 'trad-accounts-store',
      pick: ['selectedAccountId', 'accountOrder'],
    },
  },
)
