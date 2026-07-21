import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuth } from '@/lib/auth'
import { apiPut, apiGet, apiDelete, apiPost } from '@/lib/apiClient'
import { ExchangeType, type MarketContext, type NetworkType } from '@/lib/ws/protocol'
import {
  bifakeMarketContext,
  binanceMarketContext,
  bybitMarketContext,
  hyperliquidMarketContext,
} from '@/lib/marketContext'
import {
  accountMetadataChips,
  accountMetadataStatus,
  formatAccountProduct,
  isBybitMetadataVerified,
  isHyperliquidMetadataReady,
} from '@/lib/accountMetadata'
import { accountsStoreKey, getSessionUserId } from '@/lib/userSession'
import { createLogger } from '@/lib/utils'

const logger = createLogger('accounts')

export interface AccountFormPayload {
  label: string
  key: string
  secret: string
  network: NetworkType
  exchange: ExchangeType
  exchange_metadata?: ExchangeAccountMetadata | null
}

export interface HyperliquidBuilderApprovalPayload {
  action: Record<string, unknown>
  nonce: number
  signature: {
    r: string
    s: string
    v: number
  }
  builder_address: string
  builder_fee_tenths_bps: number
}

interface HyperliquidBuilderApprovalResponse {
  account: AccountRecord
  max_builder_fee_tenths_bps: number
  exchange_response: unknown
}

interface HyperliquidBuilderApprovalRefreshResponse {
  account: AccountRecord
  max_builder_fee_tenths_bps: number
  builder_approved: boolean
}

export interface AccountKeyValidationPayload {
  key: string
  secret: string
  network: NetworkType
  exchange: ExchangeType
}

export interface AccountKeyValidationResponse {
  valid: boolean
  skipped: boolean
  exchange: ExchangeType
  network: NetworkType
  present_permissions: string[]
  missing_requirements: string[]
  warnings: string[]
  read_only?: boolean | null
  exchange_message?: string | null
  error?: string
}

export interface ExchangeAccountMetadata {
  product?: string | null
  hedge_mode_only?: boolean | null
  account_mode?: string | null
  margin_mode?: string | null
  unified_margin_status?: number | null
  exchange_account_id?: string | null
  key_permissions?: string[] | null
  user_address?: string | null
  agent_address?: string | null
  vault_address?: string | null
  builder_address?: string | null
  builder_fee_tenths_bps?: number | null
  max_builder_fee_tenths_bps?: number | null
  builder_approved?: boolean | null
  agent_approved?: boolean | null
  default_leverage?: number | null
  symbol_leverage_overrides?: Record<string, number> | null
}

export interface AccountRecord {
  id: string
  label: string
  key: string
  network: NetworkType
  exchange: ExchangeType
  exchange_metadata?: ExchangeAccountMetadata | null
}

export {
  accountMetadataChips,
  accountMetadataStatus,
  formatAccountProduct,
  isBybitMetadataVerified,
  isHyperliquidMetadataReady,
}

export const useAccountsStore = defineStore('accounts', () => {
  const { isAuthenticated } = useAuth()

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
    loading.value = true
    error.value = null
    let response: AccountRecord[] | { error?: string; code?: string }
    try {
      response = await apiGet<AccountRecord[] | { error?: string; code?: string }>('/accounts', {
        throwOnHTTPError: false,
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      accountsRaw.value = []
      loading.value = false
      return
    }

    if (!Array.isArray(response)) {
      error.value = response?.error || 'Failed to load accounts'
      accountsRaw.value = []
      loading.value = false
      return
    }

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
    loading.value = false
  }

  async function addAccount(payload: AccountFormPayload): Promise<AccountRecord | null> {
    const label = encodeURIComponent(payload.label.trim())
    const resp = await apiPut(`/accounts/${label}`, payload)
    logger.debug('Add account response:', resp)
    await fetchAccounts()
    return (
      accounts.value.find(
        (account) =>
          account.label === payload.label.trim() &&
          account.exchange === payload.exchange &&
          account.network === payload.network,
      ) ?? null
    )
  }

  async function validateAccountKey(
    payload: AccountKeyValidationPayload,
  ): Promise<AccountKeyValidationResponse> {
    const response = await apiPost<AccountKeyValidationResponse | { error?: string }>(
      '/accounts/validate',
      payload,
    )
    if ('error' in response && response.error) {
      throw new Error(response.error)
    }
    return response as AccountKeyValidationResponse
  }

  async function updateAccountMetadata(
    accountId: string,
    exchangeMetadata: ExchangeAccountMetadata | null,
  ): Promise<AccountRecord> {
    const response = await apiPut<AccountRecord, { exchange_metadata: ExchangeAccountMetadata | null }>(
      `/accounts/${encodeURIComponent(accountId)}/exchange-metadata`,
      { exchange_metadata: exchangeMetadata },
      { throwOnHTTPError: true },
    )
    replaceAccount(response)
    return response
  }

  async function approveHyperliquidBuilderFee(
    accountId: string,
    payload: HyperliquidBuilderApprovalPayload,
  ): Promise<HyperliquidBuilderApprovalResponse> {
    const response = await apiPost<
      HyperliquidBuilderApprovalResponse,
      HyperliquidBuilderApprovalPayload
    >(
      `/accounts/${encodeURIComponent(accountId)}/hyperliquid/builder-approval`,
      payload,
      { throwOnHTTPError: true },
    )
    replaceAccount(response.account)
    return response
  }

  async function refreshHyperliquidBuilderApproval(
    accountId: string,
  ): Promise<HyperliquidBuilderApprovalRefreshResponse> {
    const response = await apiPost<HyperliquidBuilderApprovalRefreshResponse>(
      `/accounts/${encodeURIComponent(accountId)}/hyperliquid/builder-approval/refresh`,
      undefined,
      { throwOnHTTPError: true },
    )
    replaceAccount(response.account)
    return response
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

  function replaceAccount(account: AccountRecord): void {
    const index = accountsRaw.value.findIndex((item) => item.id === account.id)
    if (index >= 0) {
      accountsRaw.value.splice(index, 1, account)
    } else {
      accountsRaw.value.push(account)
    }
    if (!accountOrder.value.includes(account.id)) {
      accountOrder.value.push(account.id)
    }
  }

  function getMarketContextForAccount(accountId: string): MarketContext | null {
    const account = accounts.value.find((a) => a.id === accountId)
    if (!account) return null
    switch (account.exchange) {
      case ExchangeType.Binance:
        return binanceMarketContext(account.id)
      case ExchangeType.Bifake:
        return bifakeMarketContext(account.id)
      case ExchangeType.Bybit:
        return bybitMarketContext(account.id)
      case ExchangeType.Hyperliquid:
        return hyperliquidMarketContext(account.id)
      default:
        return null
    }
  }

  function getDefaultSymbolForAccount(accountId: string): string {
    const account = accounts.value.find((a) => a.id === accountId)
    if (!account) return 'BTCUSDT'
    if (account.exchange.toLowerCase() === 'bifake') return 'APPLE'
    if (account.exchange === ExchangeType.Hyperliquid) return 'BTC'
    return 'BTCUSDT'
  }

  function persistState(): void {
    const userId = getSessionUserId()
    if (!userId) return
    const payload = {
      selectedAccountId: selectedAccountId.value,
      accountOrder: accountOrder.value,
    }
    try {
      localStorage.setItem(accountsStoreKey(userId), JSON.stringify(payload))
    } catch {
      /* ignore storage failures */
    }
  }

  function loadPersistedState(userId: string): void {
    try {
      const raw = localStorage.getItem(accountsStoreKey(userId))
      if (raw) {
        const parsed = JSON.parse(raw) as {
          selectedAccountId?: string | null
          accountOrder?: string[]
        }
        if (Array.isArray(parsed.accountOrder)) {
          accountOrder.value = parsed.accountOrder
        }
        if (typeof parsed.selectedAccountId === 'string') {
          selectedAccountId.value = parsed.selectedAccountId
        } else if (parsed.selectedAccountId === null) {
          selectedAccountId.value = null
        }
      }
    } catch {
      /* ignore invalid persisted state */
    }

    if (accountsRaw.value.length === 0) {
      selectedAccountId.value = null
      return
    }
    const existingIds = new Set(accountsRaw.value.map((account) => account.id))
    accountOrder.value = accountOrder.value.filter((id) => existingIds.has(id))
    if (
      !selectedAccountId.value ||
      !accountsRaw.value.some((account) => account.id === selectedAccountId.value)
    ) {
      selectedAccountId.value = accountsRaw.value[0].id
    }
  }

  watch(
    () => isAuthenticated.value,
    (authed) => {
      if (!authed) {
        accountsRaw.value = []
        error.value = null
        lastFetchedAt.value = null
        accountOrder.value = []
        selectedAccountId.value = null
      }
    },
    { immediate: true },
  )

  watch(
    [selectedAccountId, accountOrder],
    () => {
      persistState()
    },
    { deep: true },
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
    validateAccountKey,
    updateAccountMetadata,
    approveHyperliquidBuilderFee,
    refreshHyperliquidBuilderApproval,
    removeAccount,
    reorderAccounts,
    getMarketContextForAccount,
    getDefaultSymbolForAccount,
    loadPersistedState,
  }
})
