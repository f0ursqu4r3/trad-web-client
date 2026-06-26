<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import { useCommandStore } from '@/stores/command'
import { useDeviceStore, type TrailingEntryState } from '@/stores/devices'
import { useWsStore } from '@/stores/ws'
import { CommandStatus, PositionSide, type UserCommandPayload } from '@/lib/ws/protocol'

type Phase =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'creating-sim'
  | 'submitting'
  | 'sampling'
  | 'done'
  | 'failed'

type SmokeState = {
  phase: Phase
  simMarketId: string | null
  submitted: number
  inspected: number
  commandCount: number
  deviceCount: number
  teDeviceCount: number
  totalTePoints: number
  inboundBufferCount: number
  maxEventLoopLagMs: number
  error: string | null
  events: string[]
}

const state = reactive<SmokeState>({
  phase: 'idle',
  simMarketId: null,
  submitted: 0,
  inspected: 0,
  commandCount: 0,
  deviceCount: 0,
  teDeviceCount: 0,
  totalTePoints: 0,
  inboundBufferCount: 0,
  maxEventLoopLagMs: 0,
  error: null,
  events: [],
})

const ws = useWsStore()
const commands = useCommandStore()
const devices = useDeviceStore()

let lagTimer: number | null = null

const rootTeDevices = computed(() =>
  devices.devices.filter((device) => device.kind === 'TrailingEntry' && !device.parent_device),
)

function record(message: string) {
  state.events.push(`${new Date().toISOString()} ${message}`)
  if (state.events.length > 300) state.events.shift()
}

function snapshotState(): SmokeState {
  updateCounters()
  return JSON.parse(JSON.stringify(state)) as SmokeState
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

async function sleep(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs: number) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function startLagMonitor() {
  if (lagTimer !== null) return
  let expected = performance.now() + 100
  lagTimer = window.setInterval(() => {
    const now = performance.now()
    const drift = Math.max(0, now - expected)
    expected = now + 100
    if (drift > state.maxEventLoopLagMs) {
      state.maxEventLoopLagMs = drift
    }
  }, 100)
}

function stopLagMonitor() {
  if (lagTimer === null) return
  window.clearInterval(lagTimer)
  lagTimer = null
}

function commandStatus(commandId: string): CommandStatus | null {
  return commands.history.find((item) => item.command_id === commandId)?.status ?? null
}

function commandResponseMessage(commandId: string): string | null {
  for (let i = ws.inbound.length - 1; i >= 0; i -= 1) {
    const item = ws.inbound[i]
    if (item.kind !== 'CommandResponse') continue
    const data = item.payload as { request_uuid?: string; message?: string }
    if (data.request_uuid === commandId && typeof data.message === 'string') {
      return data.message
    }
  }
  return null
}

function parseSimMarketId(message: string): string {
  const match = message.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  )
  if (!match) throw new Error(`Could not parse sim market id from: ${message}`)
  return match[1]
}

function updateCounters() {
  state.commandCount = commands.history.length
  state.deviceCount = devices.devices.length
  state.teDeviceCount = rootTeDevices.value.length
  state.totalTePoints = rootTeDevices.value.reduce((sum, device) => {
    const te = device.state as TrailingEntryState
    return sum + (te.total_points || 0)
  }, 0)
  state.inboundBufferCount = ws.inbound.length
}

async function submitCreateSim(count: number, center: number, variance: number): Promise<string> {
  const commandId = ws.sendUserCommand({
    kind: 'CreateSimMarket',
    data: {
      scenario_type: 'random',
      name: `e2e-load-${count}-${Date.now()}`,
      coin_settings: [{ coin_name: 'LOADUSDT', center, variance }],
    },
  } satisfies UserCommandPayload)
  await waitFor(
    'create sim response',
    () => commandStatus(commandId) === CommandStatus.Succeeded && !!commandResponseMessage(commandId),
    15_000,
  )
  return parseSimMarketId(commandResponseMessage(commandId) || '')
}

async function sendControlSim(
  simMarketId: string,
  action: 'SetSpeed' | 'Start' | 'Stop',
  value?: number,
) {
  const commandId = ws.sendUserCommand({
    kind: 'ControlSimMarket',
    data: { identifier: simMarketId, action, value },
  } satisfies UserCommandPayload)
  await waitFor(
    `control sim ${action}`,
    () => commandStatus(commandId) === CommandStatus.Succeeded,
    10_000,
  )
}

async function runSmoke() {
  try {
    state.error = null
    state.events = []
    state.submitted = 0
    state.inspected = 0
    state.maxEventLoopLagMs = 0
    commands.history = []
    devices.clearDevices()
    // Needed briefly so the page can parse the CreateSimMarket command response.
    // Disable before TE fanout because the debug buffer is intentionally reactive.
    ws.setInboundDebugEnabled(true)
    startLagMonitor()

    const token = param('token')
    const count = Math.floor(numberParam('count', 25))
    const inspect = Math.floor(numberParam('inspect', count))
    const durationMs = Math.floor(numberParam('durationMs', 15_000))
    const tickMs = numberParam('tickMs', 100)
    const center = numberParam('center', 100)
    const variance = numberParam('variance', 0.001)
    const activationPrice = numberParam('activation', center * 0.25)
    const stopLoss = numberParam('stop', activationPrice * 0.5)

    state.phase = 'connecting'
    ws.connect()
    await waitFor('websocket ready', () => ws.status === 'ready', 20_000)

    state.phase = 'authenticating'
    if (token) {
      ws.sendTokenLogin(token)
    }
    await waitFor('token login', () => ws.authAccepted === true, 30_000)

    state.phase = 'creating-sim'
    const simMarketId = await submitCreateSim(count, center, variance)
    state.simMarketId = simMarketId
    record(`created sim market ${simMarketId}`)
    ws.setInboundDebugEnabled(false)
    await sendControlSim(simMarketId, 'Stop')
    await sendControlSim(simMarketId, 'SetSpeed', tickMs / 1000)

    state.phase = 'submitting'
    const commandIds: string[] = []
    const marketContext = { sim: { sim_market_id: simMarketId } }
    const submitStarted = performance.now()
    for (let i = 0; i < count; i += 1) {
      const commandId = ws.sendUserCommand({
        kind: 'TrailingEntryOrder',
        data: {
          position_side: PositionSide.Long,
          symbol: 'LOADUSDT',
          activation_price: activationPrice,
          jump_frac_threshold: 0.0001,
          stop_loss: stopLoss,
          take_profit: null,
          risk_amount: 1,
          market_context: marketContext,
          split_settings: null,
        },
      } satisfies UserCommandPayload)
      commandIds.push(commandId)
      state.submitted = commandIds.length
    }
    record(`submitted ${count} TEs in ${Math.round(performance.now() - submitStarted)}ms`)
    await waitFor(
      'TE command responses',
      () => commandIds.every((id) => commandStatus(id) !== null),
      Math.max(30_000, count * 250),
    )

    for (const commandId of commandIds.slice(0, Math.min(inspect, commandIds.length))) {
      commands.inspectCommand(commandId)
      state.inspected += 1
    }
    record(`inspecting ${state.inspected} commands`)
    await waitFor(
      'inspected TE devices',
      () => rootTeDevices.value.length >= Math.min(inspect, commandIds.length),
      Math.max(30_000, inspect * 200),
    )
    await sendControlSim(simMarketId, 'Start')

    state.phase = 'sampling'
    const started = performance.now()
    while (performance.now() - started < durationMs) {
      updateCounters()
      await sleep(250)
    }
    updateCounters()
    state.phase = 'done'
    record(
      `done commands=${state.commandCount} devices=${state.deviceCount} te=${state.teDeviceCount} points=${state.totalTePoints} maxLag=${Math.round(state.maxEventLoopLagMs)}ms`,
    )
  } catch (err) {
    state.phase = 'failed'
    state.error = err instanceof Error ? err.message : String(err)
    record(`failed: ${state.error}`)
  }
}

declare global {
  interface Window {
    __tradSimLoadSmoke?: {
      start: () => Promise<void>
      getState: () => SmokeState
    }
  }
}

window.__tradSimLoadSmoke = {
  start: runSmoke,
  getState: snapshotState,
}

onMounted(() => {
  if (param('autostart') === '1') {
    void runSmoke()
  }
})

onUnmounted(() => {
  stopLagMonitor()
})
</script>

<template>
  <main class="sim-load-smoke" data-testid="sim-load-smoke">
    <h1>Sim Load Smoke</h1>
    <dl>
      <div><dt>Phase</dt><dd data-testid="smoke-phase">{{ state.phase }}</dd></div>
      <div><dt>Sim Market</dt><dd>{{ state.simMarketId || '-' }}</dd></div>
      <div><dt>Submitted</dt><dd>{{ state.submitted }}</dd></div>
      <div><dt>Inspected</dt><dd>{{ state.inspected }}</dd></div>
      <div><dt>Commands</dt><dd>{{ state.commandCount }}</dd></div>
      <div><dt>Devices</dt><dd>{{ state.deviceCount }}</dd></div>
      <div><dt>TE Devices</dt><dd>{{ state.teDeviceCount }}</dd></div>
      <div><dt>Total TE Points</dt><dd>{{ state.totalTePoints }}</dd></div>
      <div><dt>Max Lag</dt><dd>{{ Math.round(state.maxEventLoopLagMs) }}ms</dd></div>
      <div><dt>Error</dt><dd data-testid="smoke-error">{{ state.error || '-' }}</dd></div>
    </dl>
    <button type="button" @click="runSmoke">Run</button>
    <pre>{{ state.events.join('\n') }}</pre>
  </main>
</template>

<style scoped>
.sim-load-smoke {
  min-height: 100vh;
  padding: 16px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, sans-serif;
}

dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 16px;
}

dt {
  color: var(--color-text-dim);
  font-size: 12px;
}

dd {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

pre {
  max-height: 50vh;
  overflow: auto;
}
</style>
