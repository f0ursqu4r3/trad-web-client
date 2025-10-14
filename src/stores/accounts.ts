import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiPut, apiGet } from '@/lib/apiClient'
import {
  deleteGatewayAccount,
  listGatewayAccounts,
  type GatewayAccount,
  upsertGatewayAccount,
} from '@/lib/gatewayClient'
import { useWsStore } from '@/stores/ws'

export interface AccountFormPayload {
  label: string
  apiKey: string
  secretKey: string
  network: string
}

export const useAccountsStore = defineStore('accounts', () => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const ws = useWsStore()

  const accounts = ref<GatewayAccount[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedAccountId = ref<string | null>(null)
  const lastFetchedAt = ref<number | null>(null)

  const selectedAccount = computed(() =>
    accounts.value.find((a) => a.id === selectedAccountId.value) ?? null,
  )
  const hasAccounts = computed(() => accounts.value.length > 0)

  async function fetchAccounts(): Promise<void> {
    const response = await apiGet<{ accounts: GatewayAccount[] }>(
      '/accounts',
    )
    console.log('Fetched accounts from API:', response)

  }

  async function _fetchAccounts(): Promise<void> {
    if (!isAuthenticated.value) {
      accounts.value = []
      selectedAccountId.value = null
      return
    }

    loading.value = true
    error.value = null
    try {
      accounts.value = await listGatewayAccounts()
      lastFetchedAt.value = Date.now()
      if (selectedAccountId.value && !selectedAccount.value) {
        selectedAccountId.value = null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      accounts.value = []
      selectedAccountId.value = null
    } finally {
      loading.value = false
    }
  }

  async function obtainUserToken(): Promise<string> {
    const token = await getAccessTokenSilently({
      authorizationParams: {
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: import.meta.env.VITE_AUTH0_SCOPE,
      },
    })
    if (!token) {
      throw new Error('Unable to obtain user token for gateway refresh')
    }
    if (typeof token === 'string') {
      return token
    }
    throw new Error('Received unexpected token format from Auth0')
  }


  async function upsertGatewayAccount(
    label: string,
    payload: UpsertGatewayAccountRequest,
  ): Promise<GatewayAccount> {
    return apiPut<GatewayAccount, UpsertGatewayAccountRequest>(`/api/keys/${encodeURIComponent(label)}`, payload, {
      baseUrl: getGatewayBaseUrl(),
      throwOnHTTPError: true,
    })
  }

  async function createAccount(payload: AccountFormPayload): Promise<GatewayAccount> {
    await upsertGatewayAccount(payload.label, {
      label: payload.label,
      key_id: payload.apiKey,
      secret: payload.secretKey,
      meta: { network: payload.network },
    })
    await fetchAccounts()
    const account =
      accounts.value.find((a) => a.label === payload.label) ?? null
    if (!account) {
      throw new Error('Account not found after creation')
    }
    const userToken = await obtainUserToken()
    ws.sendRefreshAccountKeys(account.id, account.label, userToken)
    selectedAccountId.value = account.id
    return account
  }

  async function updateAccount(
    accountId: string,
    payload: AccountFormPayload,
  ): Promise<GatewayAccount> {
    await upsertGatewayAccount(payload.label, {
      label: payload.label,
      key_id: payload.apiKey,
      secret: payload.secretKey,
      meta: { network: payload.network },
    })
    const userToken = await obtainUserToken()
    await fetchAccounts()
    const account =
      accounts.value.find((a) => a.id === accountId) ?? null
    if (!account) {
      throw new Error('Account not found after update')
    }
    ws.sendRefreshAccountKeys(accountId, account.label, userToken)
    return account
  }

  async function removeAccount(account: GatewayAccount): Promise<void> {
    await deleteGatewayAccount(account.label)
    let userToken: string | null = null
    try {
      userToken = await obtainUserToken()
    } catch {
      userToken = null
    }
    if (userToken) {
      ws.sendRefreshAccountKeys(account.id, account.label, userToken)
    }
    await fetchAccounts()
    if (selectedAccountId.value === account.id) {
      selectedAccountId.value = null
    }
  }

  function selectAccount(accountId: string | null): void {
    selectedAccountId.value = accountId
    if (accountId) {
      ws.sendUserCommand({
        kind: 'UseBinance',
        data: { account_id: accountId },
      })
    }
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
    accounts,
    loading,
    error,
    selectedAccountId,
    selectedAccount,
    hasAccounts,
    lastFetchedAt,
    fetchAccounts,
    createAccount,
    updateAccount,
    removeAccount,
    selectAccount,
  }
})
