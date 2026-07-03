<script setup lang="ts">
import { computed, onMounted, reactive, type Component } from 'vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore, type TrailingEntryState } from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import { bybitMarketContext } from '@/lib/marketContext'
import SplitView from '@/components/general/SplitView.vue'
import OrdersColumn from '@/components/terminal/layout/OrdersColumn.vue'
import TrailingEntryView from '@/components/terminal/views/TrailingEntryView.vue'
import DeviceDetailsView from '@/components/terminal/views/DeviceDetailsView.vue'
import {
  CommandStatus,
  ExchangeType,
  MarketAction,
  MarketOrderStatus,
  NetworkType,
  PositionSide,
  type OrderThrottleSnapshotData,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

type BulkPhase =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'submitting'
  | 'waiting-open'
  | 'closing'
  | 'waiting-close'
  | 'cleanup'
  | 'closed'
  | 'failed'

type SymbolPlan = {
  symbol: string
  price: number
  activation: number
  stopLoss: number
  takeProfit: number
}

type BulkState = {
  phase: BulkPhase
  accountId: string | null
  requested: number
  minOpenCount: number
  submitted: number
  accepted: number
  openFilled: number
  closeRequested: number
  closeFilled: number
  nativeProtectionCount: number
  inspectedCommandId: string | null
  inspectedSymbol: string | null
  inspectedTeDeviceId: string | null
  throttle: OrderThrottleSnapshotData | null
  error: string | null
  events: string[]
}

const state = reactive<BulkState>({
  phase: 'idle',
  accountId: null,
  requested: 0,
  minOpenCount: 0,
  submitted: 0,
  accepted: 0,
  openFilled: 0,
  closeRequested: 0,
  closeFilled: 0,
  nativeProtectionCount: 0,
  inspectedCommandId: null,
  inspectedSymbol: null,
  inspectedTeDeviceId: null,
  throttle: null,
  error: null,
  events: [],
})

const ws = useWsStore()
const accounts = useAccountsStore()
const commands = useCommandStore()
const devices = useDeviceStore()

const componentMap: Record<string, Component> = {
  TrailingEntryOrder: TrailingEntryView,
}

const currentComponent = computed<Component>(() => {
  const selected = commands.selectedCommand
  if (!selected) return DeviceDetailsView
  return componentMap[selected.command.kind] || DeviceDetailsView
})

let submittedCommandIds: string[] = []
let closeCommandIds: string[] = []
let closeRequestedTeCommandIds = new Set<string>()
let cancelRequestedCommandIds = new Set<string>()
let throttlePoll: number | null = null
let lastInspectAllAt = 0

function record(message: string) {
  state.events.push(`${new Date().toISOString()} ${message}`)
  if (state.events.length > 500) state.events.shift()
}

function snapshotState(): BulkState {
  refreshCounts()
  refreshThrottle()
  return JSON.parse(JSON.stringify(state)) as BulkState
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function numberParam(name: string, fallback: number): number {
  const raw = param(name)
  if (raw === null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return parsed
}

function fracParam(name: string, fallback: number): number {
  const raw = param(name)
  if (raw === null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be finite`)
  return parsed
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await wait(250)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function parseSymbolPrices(raw: string | null): Array<{ symbol: string; price: number }> {
  if (!raw) throw new Error('plans are required')
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [symbolRaw, priceRaw] = part.split(':')
      const symbol = (symbolRaw || '').trim().toUpperCase()
      const price = Number(priceRaw)
      if (!/^[A-Z0-9]+USDT$/.test(symbol)) throw new Error(`invalid symbol plan ${part}`)
      if (!Number.isFinite(price) || price <= 0) throw new Error(`invalid price plan ${part}`)
      return { symbol, price }
    })
}

function buildPlans(): SymbolPlan[] {
  const activationFrac = fracParam('activationFrac', 0.001)
  const stopLossFrac = fracParam('stopLossFrac', 0.05)
  const takeProfitFrac = fracParam('takeProfitFrac', 0.02)
  if (!(-0.5 < activationFrac && activationFrac < 1.0)) {
    throw new Error('activationFrac must be in (-0.5, 1.0)')
  }
  if (!(0.001 <= stopLossFrac && stopLossFrac < 0.5)) {
    throw new Error('stopLossFrac must be in [0.001, 0.5)')
  }
  if (!(0.001 <= takeProfitFrac && takeProfitFrac < 1.0)) {
    throw new Error('takeProfitFrac must be in [0.001, 1.0)')
  }
  return parseSymbolPrices(param('plans')).map(({ symbol, price }) => {
    const activation = price * (1 + activationFrac)
    const stopLoss = price * (1 - stopLossFrac)
    const takeProfit = price * (1 + takeProfitFrac)
    if (!(stopLoss > 0 && activation > stopLoss && takeProfit > activation)) {
      throw new Error(`invalid TE levels for ${symbol}`)
    }
    return {
      symbol,
      price,
      activation: Number(activation.toPrecision(10)),
      stopLoss: Number(stopLoss.toPrecision(10)),
      takeProfit: Number(takeProfit.toPrecision(10)),
    }
  })
}

function seedAccount(accountId: string) {
  const account = {
    id: accountId,
    label: 'Bybit Live Bulk TE',
    key: 'redacted',
    network: NetworkType.Mainnet,
    exchange: ExchangeType.Bybit,
    exchange_metadata: {
      product: 'usdt_perp',
      hedge_mode_only: true,
      account_mode: 'unified',
      margin_mode: 'regular_margin',
      unified_margin_status: 5,
    },
  } satisfies AccountRecord
  accounts.accountsRaw = [account]
  accounts.accountOrder = [accountId]
  accounts.selectedAccountId = accountId
  accounts.lastFetchedAt = Date.now()
}

function selectedMarketContext() {
  const account = accounts.selectedAccount
  return account ? accounts.getMarketContextForAccount(account.id) : null
}

function refreshThrottle() {
  const marketContext = selectedMarketContext()
  if (!marketContext) return
  state.throttle = ws.orderThrottleForMarketContext(marketContext)
}

function requestThrottleSnapshot() {
  const marketContext = selectedMarketContext()
  if (!marketContext) return
  ws.requestOrderThrottleSnapshot(marketContext)
  refreshThrottle()
}

function startThrottlePolling() {
  if (throttlePoll !== null) return
  throttlePoll = window.setInterval(requestThrottleSnapshot, 1000)
}

function stopThrottlePolling() {
  if (throttlePoll === null) return
  window.clearInterval(throttlePoll)
  throttlePoll = null
}

function commandFailed(commandId: string): string | null {
  const item = commands.history.find((entry) => entry.command_id === commandId)
  if (item?.status === CommandStatus.Failed || item?.status === CommandStatus.Malformed) {
    return `command ${commandId} ended with ${item.status}`
  }
  const failedDevice = devices.devices.find(
    (device) => device.associated_command_id === commandId && device.failed,
  )
  if (failedDevice) {
    return `device ${failedDevice.id} failed: ${failedDevice.failure_reason || 'unknown failure'}`
  }
  return null
}

function acceptedCommandIds(): string[] {
  return submittedCommandIds.filter((commandId) => {
    const item = commands.history.find((entry) => entry.command_id === commandId)
    return !!item && item.status !== CommandStatus.Failed && item.status !== CommandStatus.Malformed
  })
}

function filledMarketOrderCommandIds(action: MarketAction): string[] {
  const ids = new Set<string>()
  for (const device of devices.devices) {
    if (device.kind !== 'MarketOrder' || !device.associated_command_id) continue
    const mo = device.state as { market_action?: MarketAction; status?: MarketOrderStatus }
    if (mo.market_action === action && mo.status === MarketOrderStatus.Filled) {
      ids.add(device.associated_command_id)
    }
  }
  return submittedCommandIds.filter((commandId) => ids.has(commandId))
}

function refreshCounts() {
  state.accepted = acceptedCommandIds().length
  state.openFilled = filledMarketOrderCommandIds(MarketAction.Open).length
  state.closeFilled = filledMarketOrderCommandIds(MarketAction.Close).length
  state.nativeProtectionCount = devices.devices.filter(
    (device) => device.kind === 'NativeProtection',
  ).length
}

function throwOnAnySubmittedFailure() {
  const failure = [...submittedCommandIds, ...closeCommandIds].map(commandFailed).find(Boolean)
  if (failure) throw new Error(failure)
}

function cancelSubmittedTrailingEntries() {
  for (const commandId of submittedCommandIds) {
    if (cancelRequestedCommandIds.has(commandId)) continue
    ws.sendCancelCommand(commandId)
    cancelRequestedCommandIds.add(commandId)
    record(`requested TE cancel ${commandId}`)
  }
}

async function closeFilledOpenPositions(closeWaitMs: number) {
  const filledCommands = filledMarketOrderCommandIds(MarketAction.Open)
  for (const commandId of filledCommands) {
    if (closeRequestedTeCommandIds.has(commandId)) continue
    const closeCommandId = ws.sendUserCommand({
      kind: 'CloseTrailingEntryPosition',
      data: { command_id: commandId },
    })
    closeRequestedTeCommandIds.add(commandId)
    closeCommandIds.push(closeCommandId)
    state.closeRequested = closeRequestedTeCommandIds.size
    record(`submitted TE close ${closeCommandId} for ${commandId}`)
  }

  if (closeRequestedTeCommandIds.size === 0) return
  await waitFor(
    'bulk TE close fills',
    () => {
      inspectSubmittedCommands()
      throwOnAnySubmittedFailure()
      refreshCounts()
      return state.closeFilled >= closeRequestedTeCommandIds.size
    },
    closeWaitMs,
  )
}

function inspectLastTe(plans: SymbolPlan[]) {
  const commandId = submittedCommandIds[submittedCommandIds.length - 1]
  const plan = plans[plans.length - 1]
  state.inspectedCommandId = commandId
  state.inspectedSymbol = plan?.symbol ?? null
  if (commandId) commands.inspectCommand(commandId)
}

function inspectSubmittedCommands(force = false) {
  const now = Date.now()
  if (!force && now - lastInspectAllAt < 10_000) return
  lastInspectAllAt = now
  for (const commandId of submittedCommandIds) {
    commands.inspectCommand(commandId)
  }
}

async function startSmoke() {
  try {
    state.error = null
    state.phase = 'connecting'
    state.submitted = 0
    state.accepted = 0
    state.openFilled = 0
    state.closeRequested = 0
    state.closeFilled = 0
    state.nativeProtectionCount = 0
    state.inspectedCommandId = null
    state.inspectedSymbol = null
    state.inspectedTeDeviceId = null
    submittedCommandIds = []
    closeCommandIds = []
    closeRequestedTeCommandIds = new Set<string>()
    cancelRequestedCommandIds = new Set<string>()
    lastInspectAllAt = 0

    const accountId = param('accountId')
    const token = param('token')
    const openWaitMs = numberParam('openWaitMs', 300_000)
    const closeWaitMs = numberParam('closeWaitMs', 300_000)
    const risk = numberParam('risk', 1)
    const jumpFracThreshold = numberParam('jumpFracThreshold', 0.001)
    const targetChildNotional = numberParam('targetChildNotional', 1000)
    const maxSplitsCap = numberParam('maxSplitsCap', 1)
    const plans = buildPlans()
    const minOpenCount = Math.min(
      plans.length,
      Math.max(1, Math.floor(numberParam('minOpenCount', plans.length))),
    )
    if (!accountId) throw new Error('accountId is required')
    if (!token) throw new Error('token is required')

    state.accountId = accountId
    state.requested = plans.length
    state.minOpenCount = minOpenCount
    seedAccount(accountId)

    ws.setInboundDebugEnabled(true)
    ws.connect()
    await waitFor('websocket ready', () => ws.status === 'ready', 20_000)

    state.phase = 'authenticating'
    record('websocket ready; sending bulk TE token login')
    ws.sendTokenLogin(token)
    await waitFor('token login', () => ws.authAccepted === true, 30_000)
    requestThrottleSnapshot()
    startThrottlePolling()

    state.phase = 'submitting'
    for (const plan of plans) {
      const payload = {
        kind: 'TrailingEntryOrder',
        data: {
          position_side: PositionSide.Long,
          symbol: plan.symbol,
          activation_price: plan.activation,
          jump_frac_threshold: jumpFracThreshold,
          stop_loss: plan.stopLoss,
          take_profit: plan.takeProfit,
          risk_amount: risk,
          market_context: bybitMarketContext(accountId),
          split_settings: {
            target_child_notional: targetChildNotional,
            max_splits_cap: maxSplitsCap,
            mode: 'prefer_target',
            slippage_margin: 0.005,
          },
        },
      } satisfies UserCommandPayload
      const commandId = ws.sendUserCommand(payload)
      submittedCommandIds.push(commandId)
      state.submitted = submittedCommandIds.length
      record(`submitted bulk TE ${commandId} ${plan.symbol}`)
    }

    await waitFor(
      'all bulk TE commands accepted',
      () => {
        refreshCounts()
        return state.accepted === submittedCommandIds.length
      },
      60_000,
    )
    throwOnAnySubmittedFailure()
    inspectLastTe(plans)
    inspectSubmittedCommands(true)
    await waitFor(
      'inspected TE device',
      () =>
        !!state.inspectedCommandId &&
        devices.devices.some((device) => {
          if (device.associated_command_id !== state.inspectedCommandId) return false
          if (device.kind !== 'TrailingEntry') return false
          const te = device.state as TrailingEntryState
          if (te.symbol !== state.inspectedSymbol) return false
          state.inspectedTeDeviceId = device.id
          return true
        }),
      30_000,
    )

    state.phase = 'waiting-open'
    record(`waiting for ${minOpenCount}/${plans.length} open fills up to ${openWaitMs}ms`)
    await waitFor(
      'bulk TE open fills',
      () => {
        inspectSubmittedCommands()
        throwOnAnySubmittedFailure()
        refreshCounts()
        return state.openFilled >= minOpenCount
      },
      openWaitMs,
    )

    state.phase = 'cleanup'
    cancelSubmittedTrailingEntries()
    await wait(1_000)
    state.phase = 'closing'
    await closeFilledOpenPositions(closeWaitMs)

    state.phase = 'waiting-close'
    state.phase = 'closed'
    refreshCounts()
    requestThrottleSnapshot()
    record('bulk TE frontend smoke completed')
  } catch (err) {
    const originalError = err instanceof Error ? err.message : String(err)
    try {
      if (submittedCommandIds.length > 0) {
        state.phase = 'cleanup'
        record(`failure cancel starting after: ${originalError}`)
        cancelSubmittedTrailingEntries()
        await wait(1_000)
        inspectSubmittedCommands(true)
      }
      refreshCounts()
      if (state.openFilled > state.closeRequested) {
        state.phase = 'closing'
        record(`failure cleanup starting after: ${originalError}`)
        await closeFilledOpenPositions(120_000)
        record('failure cleanup close requests completed')
      }
    } catch (cleanupErr) {
      record(
        `failure cleanup errored: ${
          cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        }`,
      )
    }
    state.phase = 'failed'
    state.error = originalError
    record(`failed: ${state.error}`)
  } finally {
    stopThrottlePolling()
  }
}

declare global {
  interface Window {
    __tradBybitLiveBulkTe?: {
      start: () => Promise<void>
      getState: () => BulkState
    }
  }
}

window.__tradBybitLiveBulkTe = {
  start: startSmoke,
  getState: snapshotState,
}

onMounted(() => {
  if (param('autostart') === '1') {
    void startSmoke()
  }
})
</script>

<template>
  <main class="bulk-shell" data-testid="bybit-live-bulk-te">
    <SplitView storage-key="bybit-live-bulk-te-shell">
      <template #left>
        <OrdersColumn />
      </template>
      <template #right>
        <component :is="currentComponent" />
      </template>
    </SplitView>
    <aside class="bulk-status">
      <h1>Bybit Live Bulk TE</h1>
      <dl>
        <div><dt>Phase</dt><dd data-testid="bulk-phase">{{ state.phase }}</dd></div>
        <div><dt>Requested</dt><dd>{{ state.requested }}</dd></div>
        <div><dt>Min Opens</dt><dd>{{ state.minOpenCount }}</dd></div>
        <div><dt>Accepted</dt><dd>{{ state.accepted }}</dd></div>
        <div><dt>Open Filled</dt><dd>{{ state.openFilled }}</dd></div>
        <div><dt>Close Filled</dt><dd>{{ state.closeFilled }}</dd></div>
        <div><dt>Native</dt><dd>{{ state.nativeProtectionCount }}</dd></div>
        <div>
          <dt>Queue</dt>
          <dd data-testid="bulk-queue">
            {{ state.throttle?.total_queued ?? '?' }} queued /
            {{ state.throttle?.total_in_flight ?? '?' }} live
          </dd>
        </div>
        <div><dt>Inspect</dt><dd>{{ state.inspectedSymbol || '-' }}</dd></div>
        <div><dt>Error</dt><dd data-testid="bulk-error">{{ state.error || '-' }}</dd></div>
      </dl>
      <button type="button" @click="startSmoke">Run</button>
      <pre>{{ state.events.join('\n') }}</pre>
    </aside>
  </main>
</template>

<style scoped>
.bulk-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(900px, 1fr) minmax(280px, 360px);
  gap: 12px;
  padding: 12px;
  background: var(--color-bg);
  color: var(--color-text);
}

.bulk-status {
  min-height: 100%;
  font-family: system-ui, sans-serif;
  border-left: 1px solid var(--color-border);
  padding-left: 12px;
}

h1 {
  margin: 0 0 12px;
  font-size: 18px;
}

dl {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
}

dt {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

dd {
  margin: 0;
  font-size: 13px;
}

button {
  min-height: 32px;
  border: 1px solid var(--color-border);
  background: var(--color-panel);
  color: var(--color-text);
}

pre {
  max-height: 260px;
  overflow: auto;
  font-size: 11px;
  white-space: pre-wrap;
}
</style>
