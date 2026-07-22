<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore } from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import { hyperliquidMarketContext } from '@/lib/marketContext'
import {
  CommandStatus,
  ExchangeType,
  MarketAction,
  OrderStatus,
  NetworkType,
  PositionSide,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

type SmokePhase =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'submitting'
  | 'injecting'
  | 'waiting-open'
  | 'waiting-protection'
  | 'closing'
  | 'closed'
  | 'failed'

type SmokeState = {
  phase: SmokePhase
  accountId: string | null
  symbol: string
  price: number | null
  teCommandId: string | null
  injectionCommandId: string | null
  closeCommandId: string | null
  openDeviceId: string | null
  closeDeviceId: string | null
  nativeProtectionSeen: boolean
  error: string | null
  events: string[]
}

const state = reactive<SmokeState>({
  phase: 'idle',
  accountId: null,
  symbol: 'BTC',
  price: null,
  teCommandId: null,
  injectionCommandId: null,
  closeCommandId: null,
  openDeviceId: null,
  closeDeviceId: null,
  nativeProtectionSeen: false,
  error: null,
  events: [],
})

const ws = useWsStore()
const accounts = useAccountsStore()
const commands = useCommandStore()
const devices = useDeviceStore()
commands.setAutoInspectNewCommands(false)
onBeforeUnmount(() => commands.setAutoInspectNewCommands(true))

function record(message: string) {
  state.events.push(`${new Date().toISOString()} ${message}`)
  if (state.events.length > 200) state.events.shift()
}

function snapshotState(): SmokeState {
  return JSON.parse(JSON.stringify(state)) as SmokeState
}

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function numberParam(name: string, fallback?: number): number {
  const raw = param(name)
  if (raw === null || raw.trim() === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`${name} is required`)
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return parsed
}

function networkParam(): NetworkType {
  const raw = (param('network') || 'testnet').trim().toLowerCase()
  if (raw === 'mainnet') return NetworkType.Mainnet
  if (raw === 'testnet') return NetworkType.Testnet
  throw new Error('network must be testnet or mainnet')
}

function roundPrice(value: number, tick: number): number {
  return Number((Math.round(value / tick) * tick).toPrecision(12))
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

function seedAccount(accountId: string, network: NetworkType) {
  const account = {
    id: accountId,
    label: 'Hyperliquid E2E Smoke',
    key: 'redacted',
    network,
    exchange: ExchangeType.Hyperliquid,
    exchange_metadata: {
      product: 'usdc_perp',
      hedge_mode_only: false,
      account_mode: 'one_way',
      margin_mode: 'cross',
      agent_approved: true,
      builder_approved: false,
      builder_fee_tenths_bps: 0,
    },
  } satisfies AccountRecord
  accounts.accountsRaw = [account]
  accounts.accountOrder = [accountId]
  accounts.selectedAccountId = accountId
  accounts.lastFetchedAt = Date.now()
}

function findMarketOrder(commandId: string, action: MarketAction) {
  return devices.devices.find((device) => {
    if (device.associated_command_id !== commandId) return false
    if (device.kind !== 'Order') return false
    const deviceState = device.state as { market_action?: MarketAction; status?: OrderStatus }
    return deviceState.market_action === action && deviceState.status === OrderStatus.Filled
  })
}

function hasNativeProtection(commandId: string): boolean {
  return devices.devices.some((device) => {
    if (device.associated_command_id !== commandId) return false
    return device.kind === 'NativeProtection'
  })
}

function throwIfCommandFailed(commandId: string) {
  const command = commands.history.find((item) => item.command_id === commandId)
  if (command?.status === CommandStatus.Failed || command?.status === CommandStatus.Malformed) {
    throw new Error(`command ${commandId} ended with ${command.status}`)
  }
  const failedDevice = devices.devices.find(
    (device) => device.associated_command_id === commandId && device.failed,
  )
  if (failedDevice) {
    throw new Error(
      `device ${failedDevice.id} failed: ${failedDevice.failure_reason || 'unknown failure'}`,
    )
  }
}

async function startSmoke() {
  try {
    state.error = null
    state.phase = 'connecting'

    const accountId = param('accountId')
    const token = param('token')
    const network = networkParam()
    const symbol = (param('symbol') || 'BTC').trim().toUpperCase()
    const price = numberParam('price')
    const risk = numberParam('risk', 1)
    const tick = numberParam('tick', 1)
    const openWaitMs = numberParam('openWaitMs', 45_000)
    const closeWaitMs = numberParam('closeWaitMs', 45_000)
    if (!accountId) throw new Error('accountId is required')
    if (!token) throw new Error('token is required')
    if (symbol.endsWith('USDC') || symbol.endsWith('USDT')) {
      throw new Error('Hyperliquid smoke requires a native coin symbol like BTC')
    }

    state.accountId = accountId
    state.symbol = symbol
    state.price = price
    seedAccount(accountId, network)

    ws.setInboundDebugEnabled(true)
    ws.connect()
    await waitFor('websocket ready', () => ws.status === 'ready', 20_000)

    state.phase = 'authenticating'
    record('websocket ready; sending Hyperliquid e2e token login')
    ws.sendTokenLogin(token)
    await waitFor('token login', () => ws.authAccepted === true, 30_000)

    const activationPrice = roundPrice(price * 0.999, tick)
    const stopLoss = roundPrice(price * 0.98, tick)
    const takeProfit = roundPrice(price * 1.02, tick)
    const dipPrice = roundPrice(activationPrice * 0.999, tick)
    const jumpPrice = roundPrice(dipPrice * 1.002, tick)
    if (!(stopLoss > 0 && activationPrice > stopLoss && takeProfit > activationPrice)) {
      throw new Error(
        `invalid smoke levels activation=${activationPrice} stop=${stopLoss} tp=${takeProfit}`,
      )
    }

    state.phase = 'submitting'
    const tePayload = {
      kind: 'TrailingEntryOrder',
      data: {
        position_side: PositionSide.Long,
        symbol,
        activation_price: activationPrice,
        jump_frac_threshold: 0.01,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_amount: risk,
        market_context: hyperliquidMarketContext(accountId),
        split_settings: {
          target_child_notional: 1000,
          max_splits_cap: 1,
          mode: 'prefer_target',
          slippage_margin: 0.001,
        },
      },
    } satisfies UserCommandPayload
    state.teCommandId = ws.sendUserCommand(tePayload)
    record(`submitted Hyperliquid TE ${state.teCommandId}`)
    await waitFor(
      'TE command accepted',
      () =>
        !!commands.history.find(
          (item) =>
            item.command_id === state.teCommandId &&
            item.status !== CommandStatus.Failed &&
            item.status !== CommandStatus.Malformed,
        ),
      30_000,
    )
    commands.inspectCommand(state.teCommandId)

    state.phase = 'injecting'
    await wait(500)
    state.injectionCommandId = ws.e2ePublishHyperliquidPublicTrades(hyperliquidMarketContext(accountId), [
      { symbol, price: activationPrice, quantity: 1 },
      { symbol, price: dipPrice, quantity: 1 },
      { symbol, price: jumpPrice, quantity: 1 },
    ])
    record(
      `injected Hyperliquid trigger ticks activation=${activationPrice} dip=${dipPrice} jump=${jumpPrice}`,
    )

    state.phase = 'waiting-open'
    await waitFor(
      'open MarketOrder fill',
      () => {
        if (state.teCommandId) throwIfCommandFailed(state.teCommandId)
        return !!state.teCommandId && !!findMarketOrder(state.teCommandId, MarketAction.Open)
      },
      openWaitMs,
    )
    throwIfCommandFailed(state.teCommandId)
    const open = findMarketOrder(state.teCommandId, MarketAction.Open)
    if (!open) throw new Error('frontend did not observe open MarketOrder')
    state.openDeviceId = open.id
    record(`frontend observed open device=${open.id}`)

    state.phase = 'waiting-protection'
    await waitFor(
      'NativeProtection device',
      () => !!state.teCommandId && hasNativeProtection(state.teCommandId),
      15_000,
    )
    state.nativeProtectionSeen = true
    record('native protection device observed')

    state.phase = 'closing'
    state.closeCommandId = ws.sendUserCommand({
      kind: 'CloseTrailingEntryPosition',
      data: { command_id: state.teCommandId },
    })
    record(`submitted TE close ${state.closeCommandId}`)
    commands.inspectCommand(state.teCommandId)
    await waitFor(
      'close MarketOrder fill',
      () => {
        if (state.closeCommandId) throwIfCommandFailed(state.closeCommandId)
        if (state.teCommandId) throwIfCommandFailed(state.teCommandId)
        return !!state.teCommandId && !!findMarketOrder(state.teCommandId, MarketAction.Close)
      },
      closeWaitMs,
    )
    if (state.closeCommandId) throwIfCommandFailed(state.closeCommandId)
    throwIfCommandFailed(state.teCommandId)
    const close = findMarketOrder(state.teCommandId, MarketAction.Close)
    if (!close) throw new Error('frontend did not observe close MarketOrder')
    state.closeDeviceId = close.id
    state.phase = 'closed'
    record(`close filled device=${close.id}`)
  } catch (err) {
    state.phase = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    record(`failed: ${state.error}`)
  }
}

declare global {
  interface Window {
    __tradHyperliquidTeSmoke?: {
      start: () => Promise<void>
      getState: () => SmokeState
    }
  }
}

window.__tradHyperliquidTeSmoke = {
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
  <main class="smoke-shell" data-testid="hyperliquid-te-smoke">
    <h1>Hyperliquid TE Smoke</h1>
    <dl>
      <div><dt>Phase</dt><dd data-testid="smoke-phase">{{ state.phase }}</dd></div>
      <div><dt>Symbol</dt><dd>{{ state.symbol }}</dd></div>
      <div><dt>TE Command</dt><dd>{{ state.teCommandId || '-' }}</dd></div>
      <div><dt>Injection</dt><dd>{{ state.injectionCommandId || '-' }}</dd></div>
      <div><dt>Open</dt><dd>{{ state.openDeviceId || '-' }}</dd></div>
      <div><dt>Close</dt><dd>{{ state.closeDeviceId || '-' }}</dd></div>
      <div><dt>Native Protection</dt><dd>{{ state.nativeProtectionSeen ? 'yes' : 'no' }}</dd></div>
      <div><dt>Error</dt><dd data-testid="smoke-error">{{ state.error || '-' }}</dd></div>
    </dl>
    <button type="button" @click="startSmoke">Run</button>
    <pre>{{ state.events.join('\n') }}</pre>
  </main>
</template>

<style scoped>
.smoke-shell {
  min-height: 100vh;
  padding: 16px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, sans-serif;
}

h1 {
  margin: 0 0 16px;
  font-size: 20px;
}

dl {
  display: grid;
  gap: 8px;
  max-width: 760px;
}

dl > div {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 12px;
}

dt {
  color: var(--color-text-muted);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

button {
  margin-top: 16px;
}

pre {
  margin-top: 16px;
  white-space: pre-wrap;
}
</style>
