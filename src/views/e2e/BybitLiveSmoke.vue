<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useAccountsStore, type AccountRecord } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore } from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import { bybitMarketContext } from '@/lib/marketContext'
import {
  CommandStatus,
  ExchangeType,
  MarketAction,
  MarketOrderStatus,
  NetworkType,
  PositionSide,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

type SmokePhase =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'submitting'
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
  closeCommandId: string | null
  openDeviceId: string | null
  closeDeviceId: string | null
  parentOrderLinkId: string | null
  nativeProtectionSeen: boolean
  error: string | null
  events: string[]
}

const state = reactive<SmokeState>({
  phase: 'idle',
  accountId: null,
  symbol: 'BTCUSDT',
  price: null,
  teCommandId: null,
  closeCommandId: null,
  openDeviceId: null,
  closeDeviceId: null,
  parentOrderLinkId: null,
  nativeProtectionSeen: false,
  error: null,
  events: [],
})

const ws = useWsStore()
const accounts = useAccountsStore()
const commands = useCommandStore()
const devices = useDeviceStore()

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

function roundTick(value: number, tick = 0.1): number {
  return Math.round(value / tick) * tick
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

function seedAccount(accountId: string) {
  const account = {
    id: accountId,
    label: 'Bybit Live Smoke',
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
}

function findMarketOrder(commandId: string, action: MarketAction) {
  return devices.devices.find((device) => {
    if (device.associated_command_id !== commandId) return false
    if (device.kind !== 'MarketOrder') return false
    const state = device.state as { market_action?: MarketAction; status?: MarketOrderStatus }
    return state.market_action === action && state.status === MarketOrderStatus.Filled
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
    const symbol = (param('symbol') || 'BTCUSDT').trim().toUpperCase()
    const price = numberParam('price')
    const risk = numberParam('risk', 1.5)
    const openWaitMs = numberParam('openWaitMs', 10_000)
    const closeWaitMs = numberParam('closeWaitMs', 15_000)
    if (!accountId) throw new Error('accountId is required')
    if (!token) throw new Error('token is required')

    state.accountId = accountId
    state.symbol = symbol
    state.price = price
    seedAccount(accountId)

    ws.setInboundDebugEnabled(true)
    ws.connect()
    await waitFor('websocket ready', () => ws.status === 'ready', 20_000)

    state.phase = 'authenticating'
    record('websocket ready; sending smoke token login')
    ws.sendTokenLogin(token)
    await waitFor('token login', () => ws.authAccepted === true, 30_000)

    const activationPrice = roundTick(price * 1.001)
    const stopLoss = roundTick(price - 1000)
    const takeProfit = roundTick(price * 1.05)
    if (stopLoss <= 0 || activationPrice <= stopLoss || takeProfit <= activationPrice) {
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
        jump_frac_threshold: 0.0001,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_amount: risk,
        market_context: bybitMarketContext(accountId),
        split_settings: {
          target_child_notional: 1000,
          max_splits_cap: 1,
          mode: 'prefer_target',
          slippage_margin: 0.001,
        },
      },
    } satisfies UserCommandPayload
    state.teCommandId = ws.sendUserCommand(tePayload)
    record(`submitted TE ${state.teCommandId}`)
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

    state.phase = 'waiting-open'
    record(`waiting ${openWaitMs}ms for TE trigger/open fill`)
    await sleep(openWaitMs)
    throwIfCommandFailed(state.teCommandId)
    const open = findMarketOrder(state.teCommandId, MarketAction.Open)
    if (open) {
      const mo = open.state as { client_order_id?: string | null }
      state.openDeviceId = open.id
      state.parentOrderLinkId = mo.client_order_id ?? null
      record(`frontend observed open device=${open.id} parent=${state.parentOrderLinkId || '-'}`)
    } else {
      record('frontend did not observe open MarketOrder before close request')
    }

    state.phase = 'waiting-protection'
    if (hasNativeProtection(state.teCommandId)) {
      state.nativeProtectionSeen = true
      record('native protection device observed')
    } else {
      record('frontend did not observe NativeProtection before close request')
    }

    state.phase = 'closing'
    state.closeCommandId = ws.sendUserCommand({
      kind: 'CloseTrailingEntryPosition',
      data: { command_id: state.teCommandId },
    })
    record(`submitted TE close ${state.closeCommandId}`)
    commands.inspectCommand(state.teCommandId)
    await sleep(closeWaitMs)
    throwIfCommandFailed(state.teCommandId)
    const close = findMarketOrder(state.teCommandId, MarketAction.Close)
    if (close) {
      state.closeDeviceId = close.id
      record(`frontend observed close device=${close.id}`)
    } else {
      record('frontend did not observe close MarketOrder before backend final assertion')
    }
    if (!state.nativeProtectionSeen && state.teCommandId) {
      commands.inspectCommand(state.teCommandId)
      try {
        await waitFor(
          'native protection device after close',
          () => !!state.teCommandId && hasNativeProtection(state.teCommandId),
          10_000,
        )
        state.nativeProtectionSeen = true
        record('native protection device observed after close')
      } catch (err) {
        record(
          `native protection device still not observed after close: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
    state.phase = 'closed'
    record(`close filled device=${state.closeDeviceId}`)
  } catch (err) {
    state.phase = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    record(`failed: ${state.error}`)
  }
}

declare global {
  interface Window {
    __tradBybitLiveSmoke?: {
      start: () => Promise<void>
      getState: () => SmokeState
    }
  }
}

window.__tradBybitLiveSmoke = {
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
  <main class="smoke-shell" data-testid="bybit-live-smoke">
    <h1>Bybit Live Smoke</h1>
    <dl>
      <div><dt>Phase</dt><dd data-testid="smoke-phase">{{ state.phase }}</dd></div>
      <div><dt>Symbol</dt><dd>{{ state.symbol }}</dd></div>
      <div><dt>TE Command</dt><dd>{{ state.teCommandId || '-' }}</dd></div>
      <div><dt>Parent Link</dt><dd data-testid="parent-order-link">{{ state.parentOrderLinkId || '-' }}</dd></div>
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
  grid-template-columns: 140px minmax(0, 1fr);
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
