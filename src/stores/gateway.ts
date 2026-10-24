import { computed, nextTick, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import {
  GatewayWebSocketClient,
  type BrowserClientMessage,
  type BrowserCommandIntent,
  type BrowserCommandOutcome,
  type BrowserHistoryError,
  type BrowserPreviewIntent,
  type BrowserPreviewOutcome,
  type BrowserPositionResolutionIntent,
  type BrowserPositionResolutionOutcome,
  type BrowserServerMessage,
  type GatewayConnectionStatus,
  type Uuid,
} from '@/lib/gateway'
import { getSocketTicket } from '@/lib/auth'
import { createLogger } from '@/lib/utils'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import {
  accountCommandReadiness,
  isNewExposureIntent,
  newExposureReadiness,
  newExposureSymbol,
} from '@/lib/gateway/accountCommandReadiness'
import { useMarketStore } from '@/stores/market'
import { createGatewayMarkets } from '@/stores/gatewayMarkets'
import { ClientWorkMeter, observeLongTasks } from '@/lib/telemetry/clientWork'
import { ConnectionTimingObserver } from '@/lib/telemetry/connectionTiming'
import { ProjectionConfirmations } from '@/lib/gateway/projectionConfirm'
import {
  browserReloadStampStorage,
  protocolMismatchAction,
  type ProtocolMismatch,
} from '@/lib/gateway/protocolVersion'
import {
  browserCardMarketStorage,
  CARD_MARKET_LIMIT,
  CardMarketHold,
  recalledCardMarkets,
} from '@/lib/gateway/cardMarkets'
import { recordTelemetry } from '@/lib/telemetry'
import { historyError, subscriptionFailure } from '@/lib/gateway/serverErrors'
import type { AbandonedTransfer } from '@/lib/gateway/messageParts'
import { LOST_HISTORY_REASON, transferRecovery } from '@/lib/gateway/transferRecovery'
import { changeRevision } from '@/lib/projection/accountPatch'
import {
  GatewayTelemetryObserver,
  type GatewayActionAttempt,
} from '@/lib/telemetry/gatewayObservation'

const logger = createLogger('gateway')
const COMMAND_RESULT_TIMEOUT_MS = 30_000
const POSITION_RESOLUTION_TIMEOUT_MS = 30_000
const PREVIEW_RESULT_TIMEOUT_MS = 15_000
const HISTORY_RESULT_TIMEOUT_MS = 30_000
const SUBSCRIPTION_RETRY_INITIAL_MS = 1_000
const SUBSCRIPTION_RETRY_MAX_MS = 30_000
// Remembered card markets stay held this long after the snapshot renders, so
// the cards' own subscriptions take over without a gap.
const CARD_MARKET_RELEASE_DELAY_MS = 2_000
// The "Trad was updated" notice is on screen this long before the reload.
const PROTOCOL_RELOAD_NOTICE_MS = 1_500

// A gateway on another browser protocol version (lib/gateway/protocolVersion.ts):
// reloading: this page is out of date and reloads now; reload_required: it
// already reloaded recently and is still out of date; server_updating: the
// gateway is older and the client keeps reconnecting.
export type ProtocolUpdateState = 'reloading' | 'reload_required' | 'server_updating'

interface PendingCommand extends GatewayActionAttempt {
  timer: number
  resolve: (outcome: BrowserCommandOutcome) => void
  reject: (error: Error) => void
}

interface PendingHistory {
  accountId: Uuid
  kind: 'modern' | 'legacy'
  timer: number
  resolve: () => void
  reject: (error: Error) => void
}

interface PendingPreview extends GatewayActionAttempt {
  timer: number
  resolve: (outcome: BrowserPreviewOutcome) => void
  reject: (error: Error) => void
}

interface PendingPositionResolution extends GatewayActionAttempt {
  timer: number
  resolve: (outcome: BrowserPositionResolutionOutcome) => void
  reject: (error: Error) => void
}

interface AccountSubscriptionRequest {
  accountId: Uuid
  preserveCurrentView: boolean
}

export class CommandOutcomeUnknownError extends Error {
  readonly requestId: Uuid

  constructor(requestId: Uuid, reason: string) {
    super(`command ${requestId} outcome is unknown: ${reason}`)
    this.name = 'CommandOutcomeUnknownError'
    this.requestId = requestId
  }
}

export const useGatewayStore = defineStore('gateway', () => {
  const accounts = useAccountsStore()
  const projections = useAccountProjectionStore()
  const markets = useMarketStore()
  const status = ref<GatewayConnectionStatus>('idle')
  const lastError = ref<string | null>(null)
  const latencyMs = ref<number | null>(null)
  const sessionValidUntil = ref<number | null>(null)
  const pendingCommandCount = ref(0)
  const pendingHistoryCount = ref(0)
  const protocolUpdate = ref<ProtocolUpdateState | null>(null)

  const subscriptionRequests = new Map<Uuid, AccountSubscriptionRequest>()
  const subscriptionAccounts = new Map<Uuid, Uuid>()
  const subscriptionRetryAttempts = new Map<Uuid, number>()
  const subscriptionRetryTimers = new Map<Uuid, number>()
  const pendingCommands = new Map<Uuid, PendingCommand>()
  const pendingPreviews = new Map<Uuid, PendingPreview>()
  const pendingHistories = new Map<Uuid, PendingHistory>()
  const pendingPositionResolutions = new Map<Uuid, PendingPositionResolution>()
  const telemetry = new GatewayTelemetryObserver()
  const connectionTiming = new ConnectionTimingObserver(() => performance.now(), recordTelemetry)
  const clientWork = new ClientWorkMeter(() => performance.now(), recordTelemetry)
  observeLongTasks(clientWork)
  let selectedSubscriptionId: Uuid | null = null
  let started = false

  const url = import.meta.env.VITE_WS_URL || location.origin.replace(/^http/, 'ws') + '/ws'
  const client = new GatewayWebSocketClient({
    url,
    getTicket: getSocketTicket,
    reconnectDelayMs: 1_000,
    maxReconnectDelayMs: 30_000,
    pingIntervalMs: 30_000,
    logger,
    onTransferAbandoned: recoverTransfer,
  })

  const isConnected = computed(() => status.value === 'ready')
  const marketFeeds = createGatewayMarkets({
    markets,
    ready: () => status.value === 'ready',
    send,
    logger,
    priceApplied: (accountId, symbol) => connectionTiming.priceApplied(accountId, symbol),
  })
  const { flushMarketSamples, subscribeMarketDemands } = marketFeeds
  // Counters the confirmation wait reads to tell a slow feed from a stuck one.
  let framesReceived = 0
  let accountDeltasApplied = 0
  // Requests still waiting for a reply on a socket a lease renewal replaced.
  const retiringRequests = new Set<Uuid>()
  const confirmations = new ProjectionConfirmations(
    {
      set: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clear: (timer) => window.clearTimeout(timer),
    },
    () => Date.now(),
    (accountId) => ({
      live:
        status.value === 'ready' &&
        accounts.selectedAccountId === accountId &&
        projections.byAccount[accountId]?.status === 'ready',
      revision: projections.byAccount[accountId]?.view?.live.checkpoint.projection_revision ?? null,
      accountDeltas: accountDeltasApplied,
      frames: framesReceived,
    }),
    recoverSelectedProjection,
  )
  const cardMarkets = new CardMarketHold(
    (accountId, symbol) => marketFeeds.subscribeMarket(accountId, symbol, CARD_MARKET_LIMIT),
    (accountId, symbol) => marketFeeds.unsubscribeMarket(accountId, symbol),
  )

  client.setStatusHandler((next, error) => {
    const wasReady = status.value === 'ready'
    if (wasReady && next !== 'ready') flushMarketSamples()
    status.value = next
    lastError.value = error
    if (next === 'ready' && protocolUpdate.value === 'server_updating') protocolUpdate.value = null
    telemetry.connection(next)
    if (wasReady && next !== 'ready') {
      connectionTiming.socketLost()
      projections.markAllStale(error ?? 'gateway connection interrupted')
      // A reconnecting socket resubscribes every market, so the cards show a
      // reconnect rather than a failed feed.
      markets.disconnected(error ?? 'gateway connection interrupted', next === 'reconnecting')
      losePendingRequests(error ?? 'gateway connection interrupted')
      resetSubscriptions()
    }
  })
  client.setReadyHandler((validForMs, cause) => {
    sessionValidUntil.value = Date.now() + validForMs
    connectionTiming.socketReady(cause)
    if (cause === 'lease_rotation') retireReplacedSocket()
    resetSubscriptions()
    const preserveCurrentView = cause === 'lease_rotation'
    // Prices first: they never wait behind the account snapshot.
    subscribeMarketDemands(!preserveCurrentView)
    holdRememberedCardMarkets()
    subscribeSelectedAccount(!preserveCurrentView)
  })
  client.setLeaseRotationHandler((phase, outcomeCode) => {
    telemetry.leaseRotation(phase, outcomeCode)
    if (phase === 'started') connectionTiming.rotationStarted()
  })
  client.setMessageHandler(handleMessage)
  client.setProtocolMismatchHandler(handleProtocolMismatch)
  client.setFrameObserver((kind, frameBytes, applyMs) => {
    framesReceived += 1
    // a part of an account message is account feed progress (the confirm wait)
    if (kind.startsWith('message_part:account_')) accountDeltasApplied += 1
    clientWork.message(frameBytes, applyMs)
    // Only e2e/network-budgets.spec.ts defines this probe.
    frameProbe()?.push({ kind, bytes: frameBytes, ms: applyMs })
    if (retiringRequests.size > 0) closeSettledRetiringSocket()
  })

  // A background tab holds market samples instead of rendering each one; the
  // tab shows them in a single update when it is visible again.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') flushMarketSamples()
      client.checkLease()
    })
  }

  watch(
    () => accounts.selectedAccountId,
    (accountId) => {
      if (accountId !== null) {
        telemetry.accountSelected(accountId)
      }
      if (status.value === 'ready') switchSelectedAccount()
    },
    { immediate: true },
  )

  watch(
    () => projections.selected?.status ?? 'idle',
    (next, previous) => {
      if (next === previous) return
      telemetry.sync(accounts.selectedAccountId, next, previous)
    },
  )

  // Returns true to stop reconnecting.
  function handleProtocolMismatch(mismatch: ProtocolMismatch): boolean {
    const action = protocolMismatchAction(mismatch, browserReloadStampStorage(), Date.now())
    logger.warn(
      `Gateway speaks browser protocol ${mismatch.expected}, this page ${mismatch.actual}: ${action}`,
    )
    if (action === 'wait_for_server') {
      protocolUpdate.value = 'server_updating'
      return false
    }
    if (action === 'reload') {
      protocolUpdate.value = 'reloading'
      window.setTimeout(() => window.location.reload(), PROTOCOL_RELOAD_NOTICE_MS)
      return true
    }
    protocolUpdate.value = 'reload_required'
    return true
  }

  function connect(): void {
    if (started) return
    started = true
    client.connect()
  }

  function disconnect(): void {
    if (!started) return
    started = false
    flushMarketSamples()
    cardMarkets.release()
    connectionTiming.socketLost()
    client.disconnect()
    projections.markAllStale('gateway disconnected')
    markets.disconnected('gateway disconnected', false)
    losePendingRequests('gateway disconnected')
    resetSubscriptions()
  }

  function submitCommand(
    intent: BrowserCommandIntent,
    accountId = accounts.selectedAccountId,
    requestId = uuid(),
    actionAttemptId?: Uuid,
  ): Promise<BrowserCommandOutcome> {
    if (accountId === null) {
      telemetry.blockedIntent(intent, null, 'ACCOUNT_NOT_HYDRATED', actionAttemptId)
      return Promise.reject(new Error('no trading account is selected'))
    }
    const attempt = telemetry.attempt(intent, accountId, requestId, actionAttemptId)
    const account = accounts.accounts.find((candidate) => candidate.id === accountId)
    const exchangeCredentialReady =
      account?.exchange !== 'hyperliquid' || account.exchange_metadata?.agent_approved === true
    const readiness = accountCommandReadiness(
      status.value === 'ready',
      projections.byAccount[accountId]?.status,
      exchangeCredentialReady,
    )
    if (!readiness.ready) {
      telemetry.readinessBlocked(attempt, readiness.reason)
      return Promise.reject(new Error(readiness.reason!))
    }
    if (isNewExposureIntent(intent)) {
      const newRisk = newExposureReadiness(
        readiness,
        projections.byAccount[accountId]?.view?.live.checkpoint,
        newExposureSymbol(intent),
      )
      if (!newRisk.ready) {
        telemetry.readinessBlocked(attempt, newRisk.reason)
        return Promise.reject(new Error(newRisk.reason!))
      }
    }
    if (pendingCommands.has(requestId)) {
      telemetry.blocked(attempt.actionAttemptId, attempt.actionKind, accountId, 'COMMAND_REJECTED')
      return Promise.reject(new Error(`command request ${requestId} is already pending`))
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingCommands.delete(requestId)
        updatePendingCounts()
        telemetry.timedOut(attempt)
        reject(new CommandOutcomeUnknownError(requestId, 'gateway response timed out'))
      }, COMMAND_RESULT_TIMEOUT_MS)
      telemetry.submitted(attempt)
      pendingCommands.set(requestId, { ...attempt, timer, resolve, reject })
      updatePendingCounts()
      try {
        send({ kind: 'submit_command', request_id: requestId, account_id: accountId, intent })
        telemetry.requestSent(attempt)
      } catch (error) {
        window.clearTimeout(timer)
        pendingCommands.delete(requestId)
        updatePendingCounts()
        telemetry.sendFailed(attempt)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function resolvePositionDeficit(
    resolution: BrowserPositionResolutionIntent,
    accountId = accounts.selectedAccountId,
    requestId = uuid(),
  ): Promise<BrowserPositionResolutionOutcome> {
    if (accountId === null) {
      telemetry.blockedPosition(null, 'ACCOUNT_NOT_HYDRATED')
      return Promise.reject(new Error('no trading account is selected'))
    }
    const attempt = telemetry.positionAttempt(accountId, requestId)
    if (status.value !== 'ready') {
      telemetry.blocked(attempt.actionAttemptId, attempt.actionKind, accountId, 'TRANSPORT_OFFLINE')
      return Promise.reject(new Error('gateway is not connected'))
    }
    if (pendingPositionResolutions.has(requestId)) {
      telemetry.blocked(attempt.actionAttemptId, attempt.actionKind, accountId, 'COMMAND_REJECTED')
      return Promise.reject(new Error(`position resolution ${requestId} is already pending`))
    }
    if (
      Array.from(pendingPositionResolutions.values()).some(
        (pending) => pending.accountId === accountId,
      )
    ) {
      telemetry.blocked(attempt.actionAttemptId, attempt.actionKind, accountId, 'COMMAND_REJECTED')
      return Promise.reject(new Error('an account position resolution is already pending'))
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingPositionResolutions.delete(requestId)
        updatePendingCounts()
        telemetry.timedOut(attempt)
        reject(new Error(`position resolution ${requestId} timed out; its outcome is unknown`))
      }, POSITION_RESOLUTION_TIMEOUT_MS)
      pendingPositionResolutions.set(requestId, { ...attempt, timer, resolve, reject })
      updatePendingCounts()
      telemetry.submitted(attempt, 'position_resolution')
      try {
        send({
          kind: 'resolve_position_deficit',
          request_id: requestId,
          account_id: accountId,
          resolution,
        })
        telemetry.requestSent(attempt)
      } catch (error) {
        window.clearTimeout(timer)
        pendingPositionResolutions.delete(requestId)
        updatePendingCounts()
        telemetry.sendFailed(attempt)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function previewCommand(
    intent: BrowserPreviewIntent,
    accountId = accounts.selectedAccountId,
    requestId = uuid(),
    actionAttemptId?: Uuid,
  ): Promise<BrowserPreviewOutcome> {
    if (accountId === null) {
      telemetry.blockedIntent(intent, null, 'ACCOUNT_NOT_HYDRATED', actionAttemptId)
      return Promise.reject(new Error('no trading account is selected'))
    }
    const attempt = telemetry.attempt(intent, accountId, requestId, actionAttemptId)
    if (pendingPreviews.has(requestId)) {
      telemetry.blocked(attempt.actionAttemptId, attempt.actionKind, accountId, 'COMMAND_REJECTED')
      return Promise.reject(new Error(`planning request ${requestId} is already pending`))
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingPreviews.delete(requestId)
        telemetry.previewTimedOut(attempt)
        reject(new Error(`planning request ${requestId} timed out`))
      }, PREVIEW_RESULT_TIMEOUT_MS)
      pendingPreviews.set(requestId, { ...attempt, timer, resolve, reject })
      telemetry.previewRequested(attempt)
      try {
        send({ kind: 'preview_command', request_id: requestId, account_id: accountId, intent })
        telemetry.requestSent(attempt)
      } catch (error) {
        window.clearTimeout(timer)
        pendingPreviews.delete(requestId)
        telemetry.previewTransportFailed(attempt, 'send_failed')
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function requestOlderHistory(accountId = accounts.selectedAccountId, limit = 100): Promise<void> {
    if (accountId === null) return Promise.reject(new Error('no trading account is selected'))
    const entry = projections.byAccount[accountId]
    if (entry?.view === null || entry?.view === undefined) {
      return Promise.reject(new Error('account projection is not ready'))
    }
    const requestId = uuid()
    const before = entry.view.history?.next_cursor ?? null
    const expectedRevision = entry.view.live.checkpoint.projection_revision

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(new Error(`history request ${requestId} timed out`))
      }, HISTORY_RESULT_TIMEOUT_MS)
      pendingHistories.set(requestId, { accountId, kind: 'modern', timer, resolve, reject })
      updatePendingCounts()
      try {
        send({
          kind: 'request_command_history',
          request_id: requestId,
          account_id: accountId,
          expected_projection_revision: expectedRevision,
          before,
          limit,
        })
      } catch (error) {
        window.clearTimeout(timer)
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function requestLegacyHistory(
    accountId = accounts.selectedAccountId,
    limit = 100,
  ): Promise<void> {
    if (accountId === null) return Promise.reject(new Error('no trading account is selected'))
    const entry = projections.byAccount[accountId]
    if (entry?.view === null || entry?.view === undefined) {
      return Promise.reject(new Error('account projection is not ready'))
    }
    if (entry.view.live.checkpoint.legacy_migration === undefined) {
      return Promise.reject(new Error('account has no imported command history'))
    }
    const requestId = uuid()
    const before = entry.view.legacyHistory?.next_cursor ?? null
    const expectedRevision = entry.view.live.checkpoint.projection_revision

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(new Error(`imported history request ${requestId} timed out`))
      }, HISTORY_RESULT_TIMEOUT_MS)
      pendingHistories.set(requestId, { accountId, kind: 'legacy', timer, resolve, reject })
      updatePendingCounts()
      try {
        send({
          kind: 'request_legacy_command_history',
          request_id: requestId,
          account_id: accountId,
          expected_projection_revision: expectedRevision,
          before,
          limit,
        })
      } catch (error) {
        window.clearTimeout(timer)
        pendingHistories.delete(requestId)
        updatePendingCounts()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function handleMessage(message: BrowserServerMessage, frameBytes: number): void {
    // Everything else applies in arrival order after the samples before it.
    if (message.kind !== 'market_samples') flushMarketSamples()
    switch (message.kind) {
      case 'hello':
        return
      case 'account_snapshot':
        handleSnapshot(message, frameBytes)
        return
      case 'account_resumed':
        handleResumed(message, frameBytes)
        return
      case 'account_delta':
      case 'account_patch':
        handleDelta(message)
        return
      case 'account_error':
        handleAccountError(message)
        return
      case 'account_unsubscribed':
        handleUnsubscribed(message.subscription_id)
        return
      case 'market_window':
        marketFeeds.handleMarketWindow(message)
        return
      case 'market_samples':
        marketFeeds.handleMarketSamples(message)
        return
      case 'market_error':
        marketFeeds.handleMarketError(message)
        return
      case 'market_feed_unavailable':
        marketFeeds.handleMarketFeedUnavailable(message)
        return
      case 'market_unsubscribed':
        marketFeeds.handleMarketUnsubscribed(message.subscription_id)
        return
      case 'command_result':
        handleCommandResult(message)
        return
      case 'command_preview_result':
        handleCommandPreviewResult(message)
        return
      case 'position_resolution_result':
        handlePositionResolutionResult(message)
        return
      case 'command_history_page':
        handleHistoryPage(message)
        return
      case 'command_history_error':
        handleHistoryError(message.request_id, message.error, 'modern')
        return
      case 'legacy_command_history_page':
        handleLegacyHistoryPage(message)
        return
      case 'legacy_command_history_error':
        handleHistoryError(message.request_id, message.error, 'legacy')
        return
      case 'pong':
        latencyMs.value = Math.max(0, Date.now() - message.nonce)
        return
    }
  }

  function handleSnapshot(
    message: Extract<BrowserServerMessage, { kind: 'account_snapshot' }>,
    frameBytes: number,
  ): void {
    const request =
      message.request_id === null ? null : subscriptionRequests.get(message.request_id)
    const requestedAccount = request?.accountId ?? message.route.account_id
    if (message.request_id !== null) subscriptionRequests.delete(message.request_id)
    const accountId = message.snapshot.checkpoint.shard.account_id
    if (
      requestedAccount !== accountId ||
      message.route.account_id !== accountId ||
      message.route.exchange !== message.snapshot.checkpoint.shard.exchange ||
      message.route.network !== message.snapshot.checkpoint.shard.network
    ) {
      projections.fail(
        accountId,
        'gateway snapshot route does not match its projection shard',
        'invalid_data',
      )
      resubscribe(accountId, message.subscription_id)
      return
    }

    subscriptionAccounts.set(message.subscription_id, accountId)
    if (accounts.selectedAccountId !== accountId) {
      send({ kind: 'unsubscribe_account', subscription_id: message.subscription_id })
      return
    }
    selectedSubscriptionId = message.subscription_id
    clearSubscriptionRetry(accountId)
    if (
      !projections.install(
        accountId,
        message.subscription_id,
        message.cause,
        message.snapshot,
        request?.preserveCurrentView ?? false,
        message.stream_id ?? null,
      )
    ) {
      subscriptionAccounts.delete(message.subscription_id)
      selectedSubscriptionId = null
      send({ kind: 'unsubscribe_account', subscription_id: message.subscription_id })
      scheduleSubscriptionRetry(accountId, true)
      return
    }
    connectionTiming.snapshotApplied(accountId, frameBytes)
    releaseCardMarketsAfterRender(accountId)
    telemetry.snapshot(accountId, message.snapshot.checkpoint.projection_revision, message.cause)
    telemetry.terminalCommands(
      message.snapshot.commands,
      message.snapshot.checkpoint.projection_revision,
    )
  }

  // A resumed subscription: only the deltas missed while away, applied all
  // at once. Anything off asks for a snapshot instead (the store forgets the
  // stream, so the next subscribe does not resume).
  function handleResumed(
    message: Extract<BrowserServerMessage, { kind: 'account_resumed' }>,
    frameBytes: number,
  ): void {
    const request = subscriptionRequests.get(message.request_id)
    subscriptionRequests.delete(message.request_id)
    const accountId = message.route.account_id
    if (request === undefined || request.accountId !== accountId) {
      send({ kind: 'unsubscribe_account', subscription_id: message.subscription_id })
      return
    }
    subscriptionAccounts.set(message.subscription_id, accountId)
    if (accounts.selectedAccountId !== accountId) {
      send({ kind: 'unsubscribe_account', subscription_id: message.subscription_id })
      return
    }
    selectedSubscriptionId = message.subscription_id
    const deltas = projections.resume(accountId, message)
    if (deltas === null) {
      logger.warn('Resume did not apply; requesting a fresh snapshot')
      resubscribe(accountId, message.subscription_id)
      return
    }
    clearSubscriptionRetry(accountId)
    accountDeltasApplied += deltas.length
    connectionTiming.snapshotApplied(accountId, frameBytes)
    releaseCardMarketsAfterRender(accountId)
    for (const delta of deltas) {
      telemetry.terminalCommands(delta.commands, delta.checkpoint.projection_revision)
    }
  }

  // A delta, or a protocol 17 patch of the window (lib/projection/accountPatch.ts).
  function handleDelta(
    message: Extract<BrowserServerMessage, { kind: 'account_delta' | 'account_patch' }>,
  ): void {
    const accountId = subscriptionAccounts.get(message.subscription_id)
    if (accountId === undefined || accountId !== message.route.account_id) return
    try {
      const delta = projections.apply(accountId, message.subscription_id, message)
      accountDeltasApplied += 1
      telemetry.terminalCommands(delta.commands, delta.checkpoint.projection_revision)
    } catch (error) {
      logger.warn('Projection delta rejected; requesting a fresh snapshot', error)
      telemetry.projectionGap(accountId, changeRevision(message) ?? 0)
      resubscribe(accountId, message.subscription_id)
    }
  }

  // A message in parts lost a part (lib/gateway/transferRecovery.ts).
  function recoverTransfer(lost: AbandonedTransfer): void {
    logger.warn(`Gateway ${lost.messageKind ?? 'message'} lost in transit: ${lost.reason}`)
    const action = transferRecovery(
      lost,
      subscriptionRequests,
      subscriptionAccounts,
      pendingHistories,
    )
    if (action.kind === 'resubscribe') {
      if (action.requestId !== null) subscriptionRequests.delete(action.requestId)
      resubscribe(action.accountId, action.subscriptionId)
    } else if (action.kind === 'fail_history') {
      const error = { kind: 'unavailable' as const, reason: LOST_HISTORY_REASON, retryable: true }
      handleHistoryError(action.requestId, error, pendingHistories.get(action.requestId)!.kind)
    }
  }

  function handleAccountError(
    message: Extract<BrowserServerMessage, { kind: 'account_error' }>,
  ): void {
    const request =
      message.request_id === null ? null : (subscriptionRequests.get(message.request_id) ?? null)
    if (message.request_id !== null) subscriptionRequests.delete(message.request_id)
    if (message.subscription_id !== null) {
      subscriptionAccounts.delete(message.subscription_id)
      if (selectedSubscriptionId === message.subscription_id) selectedSubscriptionId = null
    }
    if (
      request?.preserveCurrentView === true &&
      message.error.kind !== 'unauthorized' &&
      projections.byAccount[message.account_id]?.status === 'ready'
    ) {
      scheduleSubscriptionRetry(message.account_id, true)
      return
    }
    const failure = subscriptionFailure(message.error)
    if (cardMarkets.account() === message.account_id) cardMarkets.release()
    projections.fail(message.account_id, failure.reason, failure.kind)
    telemetry.accountUnavailable(message.account_id, message.error.kind)
    if (message.error.kind !== 'unauthorized') scheduleSubscriptionRetry(message.account_id)
  }

  function handleUnsubscribed(subscriptionId: Uuid): void {
    const accountId = subscriptionAccounts.get(subscriptionId)
    subscriptionAccounts.delete(subscriptionId)
    projections.clearSubscription(subscriptionId)
    if (selectedSubscriptionId === subscriptionId) selectedSubscriptionId = null
    if (accountId === accounts.selectedAccountId) subscribeSelectedAccount()
  }

  function handleCommandResult(
    message: Extract<BrowserServerMessage, { kind: 'command_result' }>,
  ): void {
    const pending = pendingCommands.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingCommands.delete(message.request_id)
    updatePendingCounts()
    if (pending.accountId !== message.account_id) {
      pending.reject(new Error('command result account does not match its request'))
      return
    }
    telemetry.commandResult(pending, message.outcome)
    if (message.outcome.kind === 'accepted') {
      confirmProjectionRevision(message.account_id, message.outcome.account_revision)
    }
    pending.resolve(message.outcome)
  }

  function handleCommandPreviewResult(
    message: Extract<BrowserServerMessage, { kind: 'command_preview_result' }>,
  ): void {
    const pending = pendingPreviews.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingPreviews.delete(message.request_id)
    telemetry.previewResponse(pending)
    if (pending.accountId !== message.account_id) {
      telemetry.previewTransportFailed(pending, 'account_mismatch')
      pending.reject(new Error('planning result account does not match its request'))
      return
    }
    pending.resolve(message.outcome)
  }

  function handlePositionResolutionResult(
    message: Extract<BrowserServerMessage, { kind: 'position_resolution_result' }>,
  ): void {
    const pending = pendingPositionResolutions.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingPositionResolutions.delete(message.request_id)
    updatePendingCounts()
    if (pending.accountId !== message.account_id) {
      pending.reject(new Error('position resolution result account does not match its request'))
      return
    }
    telemetry.positionResult(pending, message.outcome)
    if (message.outcome.kind === 'accepted') {
      confirmProjectionRevision(message.account_id, message.outcome.account_revision)
    }
    pending.resolve(message.outcome)
  }

  // The accepted revision should arrive as a delta; see lib/gateway/projectionConfirm.ts
  // for when a missing one is worth a resnapshot.
  function confirmProjectionRevision(accountId: Uuid, expectedRevision: number): void {
    const actual = projections.byAccount[accountId]?.view?.live.checkpoint.projection_revision
    if (actual !== undefined && actual >= expectedRevision) return
    confirmations.watch(accountId, expectedRevision)
  }

  function recoverSelectedProjection(accountId: Uuid, reason: string): void {
    if (status.value !== 'ready' || accounts.selectedAccountId !== accountId) return
    logger.warn('Projection acknowledgement missed; requesting an authoritative snapshot', reason)
    if (selectedSubscriptionId !== null) {
      resubscribe(accountId, selectedSubscriptionId)
      return
    }
    subscribeSelectedAccount()
  }

  function handleHistoryPage(
    message: Extract<BrowserServerMessage, { kind: 'command_history_page' }>,
  ): void {
    const pending = pendingHistories.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(message.request_id)
    updatePendingCounts()
    if (pending.kind !== 'modern' || pending.accountId !== message.account_id) {
      pending.reject(new Error('history response account does not match its request'))
      return
    }
    try {
      projections.mergeHistory(message.account_id, message.page)
      pending.resolve()
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  function handleLegacyHistoryPage(
    message: Extract<BrowserServerMessage, { kind: 'legacy_command_history_page' }>,
  ): void {
    const pending = pendingHistories.get(message.request_id)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(message.request_id)
    updatePendingCounts()
    if (pending.kind !== 'legacy' || pending.accountId !== message.account_id) {
      pending.reject(new Error('imported history response does not match its request'))
      return
    }
    try {
      projections.mergeLegacyHistory(message.account_id, message.page)
      pending.resolve()
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  function handleHistoryError(
    requestId: Uuid,
    error: BrowserHistoryError,
    kind: PendingHistory['kind'],
  ): void {
    const pending = pendingHistories.get(requestId)
    if (pending === undefined) return
    window.clearTimeout(pending.timer)
    pendingHistories.delete(requestId)
    updatePendingCounts()
    if (pending.kind !== kind) {
      pending.reject(new Error('history error kind does not match its request'))
      return
    }
    pending.reject(new Error(historyError(error, kind)))
  }

  // A lease renewal replaced the socket. Every request still pending was sent
  // on the old one, which the gateway answers on; the old socket closes once
  // they are settled (it unsubscribes its streams meanwhile, see
  // lib/gateway/retiringSockets.ts).
  function retireReplacedSocket(): void {
    retiringRequests.clear()
    for (const requestId of pendingRequestIds()) retiringRequests.add(requestId)
    closeSettledRetiringSocket()
  }

  function closeSettledRetiringSocket(): void {
    for (const requestId of retiringRequests) {
      if (!requestPending(requestId)) retiringRequests.delete(requestId)
    }
    if (retiringRequests.size === 0) client.closeRetiringSockets()
  }

  function pendingRequestIds(): Uuid[] {
    return [
      ...pendingCommands.keys(),
      ...pendingPreviews.keys(),
      ...pendingHistories.keys(),
      ...pendingPositionResolutions.keys(),
    ]
  }

  function requestPending(requestId: Uuid): boolean {
    return (
      pendingCommands.has(requestId) ||
      pendingPreviews.has(requestId) ||
      pendingHistories.has(requestId) ||
      pendingPositionResolutions.has(requestId)
    )
  }

  // The last known trade list's card prices, before its snapshot arrives. A
  // ready view (lease renewal) already has its cards mounted.
  function holdRememberedCardMarkets(): void {
    const accountId = accounts.selectedAccountId
    if (accountId === null || projections.byAccount[accountId]?.status === 'ready') return
    cardMarkets.hold(accountId, recalledCardMarkets(browserCardMarketStorage(), accountId))
  }

  function releaseCardMarketsAfterRender(accountId: Uuid): void {
    if (cardMarkets.account() !== accountId) return
    void nextTick(() => {
      window.setTimeout(() => {
        if (cardMarkets.account() === accountId) cardMarkets.release()
      }, CARD_MARKET_RELEASE_DELAY_MS)
    })
  }

  function switchSelectedAccount(): void {
    cardMarkets.release()
    clearAllSubscriptionRetries()
    if (selectedSubscriptionId !== null) {
      const oldSubscription = selectedSubscriptionId
      selectedSubscriptionId = null
      send({ kind: 'unsubscribe_account', subscription_id: oldSubscription })
    }
    holdRememberedCardMarkets()
    subscribeSelectedAccount()
  }

  function subscribeSelectedAccount(markSubscribing = true): void {
    const accountId = accounts.selectedAccountId
    if (status.value !== 'ready' || accountId === null) return
    if (
      selectedSubscriptionId !== null &&
      subscriptionAccounts.get(selectedSubscriptionId) === accountId
    ) {
      return
    }
    if (
      Array.from(subscriptionRequests.values()).some((request) => request.accountId === accountId)
    )
      return

    const requestId = uuid()
    subscriptionRequests.set(requestId, {
      accountId,
      preserveCurrentView: !markSubscribing,
    })
    // a consistent copy resumes with the deltas it missed
    const resume = projections.resumePoint(accountId)
    if (markSubscribing) projections.beginSubscription(accountId)
    send({
      kind: 'subscribe_account',
      request_id: requestId,
      account_id: accountId,
      ...(resume === null ? {} : { resume_from_revision: resume }),
    })
  }

  function resubscribe(accountId: Uuid, subscriptionId: Uuid): void {
    telemetry.resnapshot(accountId)
    subscriptionAccounts.delete(subscriptionId)
    if (selectedSubscriptionId === subscriptionId) selectedSubscriptionId = null
    try {
      send({ kind: 'unsubscribe_account', subscription_id: subscriptionId })
    } catch {
      return
    }
    if (accounts.selectedAccountId === accountId) subscribeSelectedAccount()
  }

  function scheduleSubscriptionRetry(accountId: Uuid, preserveCurrentView = false): void {
    if (
      status.value !== 'ready' ||
      accounts.selectedAccountId !== accountId ||
      subscriptionRetryTimers.has(accountId)
    ) {
      return
    }
    const attempt = subscriptionRetryAttempts.get(accountId) ?? 0
    const delay = Math.min(
      SUBSCRIPTION_RETRY_INITIAL_MS * 2 ** Math.min(attempt, 5),
      SUBSCRIPTION_RETRY_MAX_MS,
    )
    subscriptionRetryAttempts.set(accountId, attempt + 1)
    const timer = window.setTimeout(() => {
      subscriptionRetryTimers.delete(accountId)
      if (status.value === 'ready' && accounts.selectedAccountId === accountId) {
        subscribeSelectedAccount(!preserveCurrentView)
      }
    }, delay)
    subscriptionRetryTimers.set(accountId, timer)
  }

  function clearSubscriptionRetry(accountId: Uuid): void {
    const timer = subscriptionRetryTimers.get(accountId)
    if (timer !== undefined) window.clearTimeout(timer)
    subscriptionRetryTimers.delete(accountId)
    subscriptionRetryAttempts.delete(accountId)
  }

  function clearAllSubscriptionRetries(): void {
    for (const timer of subscriptionRetryTimers.values()) window.clearTimeout(timer)
    subscriptionRetryTimers.clear()
    subscriptionRetryAttempts.clear()
  }

  function send(message: BrowserClientMessage): void {
    client.send(message)
  }

  function resetSubscriptions(): void {
    flushMarketSamples()
    clearAllSubscriptionRetries()
    confirmations.cancelAll()
    marketFeeds.resetMarketSubscriptions()
    subscriptionRequests.clear()
    subscriptionAccounts.clear()
    selectedSubscriptionId = null
  }

  function losePendingRequests(reason: string): void {
    for (const [requestId, pending] of pendingCommands) {
      window.clearTimeout(pending.timer)
      telemetry.interrupted(pending)
      pending.reject(new CommandOutcomeUnknownError(requestId, reason))
    }
    pendingCommands.clear()
    for (const [requestId, pending] of pendingPreviews) {
      window.clearTimeout(pending.timer)
      telemetry.previewTransportFailed(pending, 'transport_interrupted')
      pending.reject(new Error(`planning request ${requestId} interrupted: ${reason}`))
    }
    pendingPreviews.clear()
    for (const pending of pendingHistories.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(`history request interrupted: ${reason}`))
    }
    pendingHistories.clear()
    for (const [requestId, pending] of pendingPositionResolutions) {
      window.clearTimeout(pending.timer)
      pending.reject(new Error(`position resolution ${requestId} interrupted: ${reason}`))
    }
    pendingPositionResolutions.clear()
    updatePendingCounts()
  }

  function updatePendingCounts(): void {
    pendingCommandCount.value = pendingCommands.size + pendingPositionResolutions.size
    pendingHistoryCount.value = pendingHistories.size
  }

  function newRiskReadiness(accountId: Uuid, symbol: string | null = null) {
    const account = accounts.accounts.find((candidate) => candidate.id === accountId)
    const command = accountCommandReadiness(
      status.value === 'ready',
      projections.byAccount[accountId]?.status,
      account?.exchange !== 'hyperliquid' || account.exchange_metadata?.agent_approved === true,
    )
    return newExposureReadiness(
      command,
      projections.byAccount[accountId]?.view?.live.checkpoint,
      symbol,
    )
  }

  return {
    status,
    lastError,
    latencyMs,
    sessionValidUntil,
    pendingCommandCount,
    pendingHistoryCount,
    protocolUpdate,
    isConnected,
    connect,
    disconnect,
    submitCommand,
    newRiskReadiness,
    previewCommand,
    resolvePositionDeficit,
    requestOlderHistory,
    requestLegacyHistory,
    subscribeMarket: marketFeeds.subscribeMarket,
    unsubscribeMarket: marketFeeds.unsubscribeMarket,
  }
})

function frameProbe(): Array<{ kind: string; bytes: number; ms: number }> | undefined {
  return (globalThis as { __tradFrameProbe?: Array<{ kind: string; bytes: number; ms: number }> })
    .__tradFrameProbe
}

function uuid(): Uuid {
  return crypto.randomUUID()
}
