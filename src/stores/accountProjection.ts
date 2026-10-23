import { computed, markRaw, ref } from 'vue'
import { defineStore } from 'pinia'

import type {
  BrowserAccountDelta,
  BrowserAccountSnapshot,
  BrowserResumePoint,
  BrowserSnapshotCause,
  ClientCommandPage,
  LegacyCommandPage,
  ProjectionGraph,
  Uuid,
} from '@/lib/gateway'
import {
  ProjectionStateError,
  applyDelta,
  applyResumedDeltas,
  combinedProjection,
  installHandoffSnapshot,
  installSnapshot,
  mergeHistoryPage,
  mergeLegacyHistoryPage,
  type AccountProjectionView,
} from '@/lib/projection'
import { useAccountsStore } from '@/stores/accounts'

export type AccountProjectionStatus = 'idle' | 'subscribing' | 'ready' | 'stale' | 'error'
export type AccountProjectionFailure = 'authorization' | 'availability' | 'resync' | 'invalid_data'

export interface AccountProjectionState {
  status: AccountProjectionStatus
  error: string | null
  failure: AccountProjectionFailure | null
  subscriptionId: Uuid | null
  snapshotCause: BrowserSnapshotCause | null
  view: AccountProjectionView | null
  // The gateway stream `view` belongs to, while every delta since its
  // snapshot applied cleanly; null when the tab should not resume.
  streamId: Uuid | null
}

export const useAccountProjectionStore = defineStore('accountProjection', () => {
  const accounts = useAccountsStore()
  const byAccount = ref<Record<Uuid, AccountProjectionState>>({})

  const selected = computed(() => {
    const accountId = accounts.selectedAccountId
    return accountId === null ? null : (byAccount.value[accountId] ?? null)
  })
  const selectedLive = computed(() => selected.value?.view?.live ?? null)
  const selectedCommands = computed(() => {
    const view = selected.value?.view
    if (view === null || view === undefined) return []
    return view.history === null ? view.live.commands : combinedProjection(view).commands
  })
  const selectedGraph = computed<ProjectionGraph | null>(() => {
    const view = selected.value?.view
    return view === null || view === undefined ? null : combinedProjection(view)
  })

  function beginSubscription(accountId: Uuid): void {
    const entry = ensure(accountId)
    entry.status = 'subscribing'
    entry.error = null
    entry.failure = null
    entry.subscriptionId = null
  }

  function install(
    accountId: Uuid,
    subscriptionId: Uuid,
    cause: BrowserSnapshotCause,
    snapshot: BrowserAccountSnapshot,
    preserveMonotonicRevision = false,
    streamId: Uuid | null = null,
  ): boolean {
    const entry = ensure(accountId)
    try {
      entry.view = rawView(
        preserveMonotonicRevision && entry.view !== null
          ? installHandoffSnapshot(entry.view, snapshot)
          : installSnapshot(snapshot),
      )
    } catch (error) {
      if (error instanceof ProjectionStateError && error.code === 'stale_snapshot') return false
      throw error
    }
    entry.subscriptionId = subscriptionId
    entry.snapshotCause = cause
    entry.streamId = streamId
    entry.status = 'ready'
    entry.error = null
    entry.failure = null
    return true
  }

  // Where a resubscribe can resume from, or null for a snapshot.
  function resumePoint(accountId: Uuid): BrowserResumePoint | null {
    const entry = byAccount.value[accountId]
    if (entry === undefined || entry.view === null || entry.streamId === null) return null
    return {
      stream_id: entry.streamId,
      projection_revision: entry.view.live.checkpoint.projection_revision,
    }
  }

  // Installs a resume's missed deltas all at once. False (and no resume
  // next time) when the stream is not this view's or a delta does not
  // apply; the view is then untouched and the caller asks for a snapshot.
  function resume(
    accountId: Uuid,
    subscriptionId: Uuid,
    streamId: Uuid,
    deltas: readonly BrowserAccountDelta[],
  ): boolean {
    const entry = ensure(accountId)
    if (entry.view === null || entry.streamId !== streamId) {
      entry.streamId = null
      return false
    }
    try {
      entry.view = rawView(applyResumedDeltas(entry.view, deltas))
    } catch {
      entry.streamId = null
      return false
    }
    entry.subscriptionId = subscriptionId
    entry.status = 'ready'
    entry.error = null
    entry.failure = null
    return true
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
      entry.view = rawView(applyDelta(entry.view, delta))
      entry.status = 'ready'
      entry.error = null
      entry.failure = null
    } catch (error) {
      entry.streamId = null
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
    entry.view = rawView(mergeHistoryPage(entry.view, page))
  }

  function mergeLegacyHistory(accountId: Uuid, page: LegacyCommandPage): void {
    const entry = ensure(accountId)
    if (entry.view === null) {
      throw new ProjectionStateError(
        'invalid_legacy_history_page',
        'cannot install imported history before the live account snapshot',
      )
    }
    entry.view = rawView(mergeLegacyHistoryPage(entry.view, page))
  }

  function fail(
    accountId: Uuid,
    reason: string,
    failure: AccountProjectionFailure = 'availability',
  ): void {
    const entry = ensure(accountId)
    entry.status = 'error'
    entry.error = reason
    entry.failure = failure
    entry.subscriptionId = null
    entry.streamId = null
  }

  function stale(accountId: Uuid, reason: string): void {
    const entry = ensure(accountId)
    entry.status = 'stale'
    entry.error = reason
    entry.failure = 'resync'
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
      failure: null,
      subscriptionId: null,
      snapshotCause: null,
      view: null,
      streamId: null,
    }
    byAccount.value[accountId] = created
    return created
  }

  return {
    byAccount,
    selected,
    selectedLive,
    selectedCommands,
    selectedGraph,
    beginSubscription,
    install,
    resumePoint,
    resume,
    apply,
    mergeHistory,
    mergeLegacyHistory,
    fail,
    stale,
    markAllStale,
    clearSubscription,
    reset,
  }
})

// A projection view is immutable: every snapshot, delta and history page
// produces a new view object (unchanged collections keep their identity), and
// readers re-run when `entry.view` is replaced. Keeping the view out of deep
// reactivity saves proxying and dependency tracking on every row of a large
// account, which dominated main-thread time on phones.
function rawView(view: AccountProjectionView): AccountProjectionView {
  return markRaw(view)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
