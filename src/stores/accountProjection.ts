import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type {
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  BrowserSnapshotCause,
  ClientCommandPage,
  ProjectionGraph,
  Uuid,
} from '@/lib/gateway'
import {
  ProjectionStateError,
  applyDelta,
  combinedProjection,
  installSnapshot,
  mergeHistoryPage,
  type AccountProjectionView,
} from '@/lib/projection'
import { useAccountsStore } from '@/stores/accounts'

export type AccountProjectionStatus = 'idle' | 'subscribing' | 'ready' | 'stale' | 'error'

export interface AccountProjectionState {
  status: AccountProjectionStatus
  error: string | null
  subscriptionId: Uuid | null
  snapshotCause: BrowserSnapshotCause | null
  view: AccountProjectionView | null
}

export const useAccountProjectionStore = defineStore('accountProjection', () => {
  const accounts = useAccountsStore()
  const byAccount = ref<Record<Uuid, AccountProjectionState>>({})

  const selected = computed(() => {
    const accountId = accounts.selectedAccountId
    return accountId === null ? null : (byAccount.value[accountId] ?? null)
  })
  const selectedLive = computed(() => selected.value?.view?.live ?? null)
  const selectedGraph = computed<ProjectionGraph | null>(() => {
    const view = selected.value?.view
    return view === null || view === undefined ? null : combinedProjection(view)
  })

  function beginSubscription(accountId: Uuid): void {
    const entry = ensure(accountId)
    entry.status = 'subscribing'
    entry.error = null
    entry.subscriptionId = null
  }

  function install(
    accountId: Uuid,
    subscriptionId: Uuid,
    cause: BrowserSnapshotCause,
    snapshot: BrowserAccountSnapshot,
  ): void {
    const entry = ensure(accountId)
    entry.view = installSnapshot(snapshot)
    entry.subscriptionId = subscriptionId
    entry.snapshotCause = cause
    entry.status = 'ready'
    entry.error = null
  }

  function apply(accountId: Uuid, subscriptionId: Uuid, delta: BrowserAccountDelta): void {
    const entry = ensure(accountId)
    if (entry.subscriptionId !== subscriptionId || entry.view === null) {
      stale(accountId, 'received a projection delta without its authoritative snapshot')
      throw new ProjectionStateError(
        'revision_gap',
        'received a projection delta without its authoritative snapshot',
      )
    }
    try {
      entry.view = applyDelta(entry.view, delta)
      entry.status = 'ready'
      entry.error = null
    } catch (error) {
      stale(accountId, errorMessage(error))
      throw error
    }
  }

  function mergeHistory(accountId: Uuid, page: ClientCommandPage): void {
    const entry = ensure(accountId)
    if (entry.view === null) {
      throw new ProjectionStateError(
        'history_revision_mismatch',
        'cannot install history before the live account snapshot',
      )
    }
    entry.view = mergeHistoryPage(entry.view, page)
  }

  function fail(accountId: Uuid, reason: string): void {
    const entry = ensure(accountId)
    entry.status = 'error'
    entry.error = reason
    entry.subscriptionId = null
  }

  function stale(accountId: Uuid, reason: string): void {
    const entry = ensure(accountId)
    entry.status = 'stale'
    entry.error = reason
    entry.subscriptionId = null
  }

  function markAllStale(reason: string): void {
    for (const accountId of Object.keys(byAccount.value)) {
      const entry = byAccount.value[accountId]
      if (entry?.view !== null) stale(accountId, reason)
    }
  }

  function clearSubscription(subscriptionId: Uuid): void {
    for (const entry of Object.values(byAccount.value)) {
      if (entry.subscriptionId === subscriptionId) {
        entry.subscriptionId = null
        if (entry.view !== null) entry.status = 'stale'
      }
    }
  }

  function reset(): void {
    byAccount.value = {}
  }

  function ensure(accountId: Uuid): AccountProjectionState {
    const existing = byAccount.value[accountId]
    if (existing !== undefined) return existing
    const created: AccountProjectionState = {
      status: 'idle',
      error: null,
      subscriptionId: null,
      snapshotCause: null,
      view: null,
    }
    byAccount.value[accountId] = created
    return created
  }

  return {
    byAccount,
    selected,
    selectedLive,
    selectedGraph,
    beginSubscription,
    install,
    apply,
    mergeHistory,
    fail,
    stale,
    markAllStale,
    clearSubscription,
    reset,
  }
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
