<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  accountMetadataChips,
  accountMetadataStatus,
  isBybitMetadataVerified,
  useAccountsStore,
  type AccountRecord,
} from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
import { X } from 'lucide-vue-next'
import { getWebSocketToken } from '@/lib/auth'
import {
  isValidBybitUsdtSymbol,
  normalizeBybitUsdtSymbol,
  normalizeHyperliquidPerpSymbol,
} from '@/lib/bybitOrderValidation'
import {
  signHyperliquidAgentApproval,
  signHyperliquidBuilderApproval,
} from '@/lib/hyperliquidBuilderApproval'
import { createLogger } from '@/lib/utils'
import {
  isValidExecutionGuardPercent,
  percentToTenthsBps,
  resolveHyperliquidExecutionGuards,
  tenthsBpsToPercent,
} from '@/lib/hyperliquidExecutionGuards'
import {
  ExchangeType,
  type MarketCapabilitiesData,
  type OrderThrottleSnapshotData,
  type UserCommandPayload,
} from '@/lib/ws/protocol'

const logger = createLogger('accounts')

const accounts = useAccountsStore()
const ws = useWsStore()

const isCreateModalOpen = ref(false)
const refreshingAccountIds = ref<Set<string>>(new Set())
const refreshingLeverageAccountIds = ref<Set<string>>(new Set())
const requestedCapabilityAccountIds = ref<Set<string>>(new Set())
const approvingBuilderAccountIds = ref<Set<string>>(new Set())
const savingBuilderAccountIds = ref<Set<string>>(new Set())
const savingGuardAccountIds = ref<Set<string>>(new Set())
const refreshingBuilderAccountIds = ref<Set<string>>(new Set())
const approvingAgentAccountIds = ref<Set<string>>(new Set())
const refreshingAgentAccountIds = ref<Set<string>>(new Set())
const refreshError = ref<string | null>(null)
const controlError = ref<string | null>(null)
const controlMessage = ref<string | null>(null)
const leverageForms = reactive<
  Record<
    string,
    {
      symbols: string
      leverage: number
      defaultLeverage: number
      marginMode: 'cross' | 'isolated'
    }
  >
>({})
const builderForms = reactive<Record<string, { feeBps: string }>>({})
const guardForms = reactive<
  Record<string, { entryPercent: number; takeProfitPercent: number; stopLossPercent: number }>
>({})
let throttleRefreshTimer: number | null = null

const sortedAccounts = computed(() => {
  accounts.accounts.forEach(ensureLeverageForm)
  accounts.accounts.forEach(ensureBuilderForm)
  accounts.accounts.forEach(ensureGuardForm)
  return accounts.accounts.slice().sort((a, b) => a.label.localeCompare(b.label))
})

function openCreateModal() {
  isCreateModalOpen.value = true
}

async function deleteAccount(account: AccountRecord) {
  if (!window.confirm(`Delete account "${account.label}"? This cannot be undone.`)) return
  try {
    await accounts.removeAccount(account.label)
  } catch (err) {
    logger.error('delete failed', err)
  }
}

function selectAccount(account: AccountRecord) {
  accounts.selectedAccountId = account.id
  ensureLeverageForm(account)
  ensureBuilderForm(account)
  ensureGuardForm(account)
  requestAccountCapabilities(account)
  requestAccountThrottle(account)
  if (account.exchange === ExchangeType.Bybit) {
    requestAccountLeverage(account)
  }
}

async function refreshAccounts() {
  await accounts.fetchAccounts()
  requestVisibleCapabilities()
}

async function refreshAccountKeys(account: AccountRecord) {
  refreshError.value = null
  if (ws.status !== 'ready') {
    refreshError.value = 'Account refresh requires an active server connection.'
    return
  }
  const token = await getWebSocketToken()
  if (!token) {
    refreshError.value = 'Unable to refresh account credentials: no auth token available.'
    return
  }
  refreshingAccountIds.value = new Set([...refreshingAccountIds.value, account.id])
  try {
    await ws.sendRefreshAccountKeys(account.id, account.label, token)
  } catch (err) {
    refreshError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(refreshingAccountIds.value)
    next.delete(account.id)
    refreshingAccountIds.value = next
  }
}

function ensureLeverageForm(account: AccountRecord) {
  if (leverageForms[account.id]) return
  const overrides = account.exchange_metadata?.symbol_leverage_overrides ?? {}
  const overrideSymbols = Object.keys(overrides)
  const defaultLeverage = account.exchange_metadata?.default_leverage ?? 1
  const marginMode = normalizeHyperliquidMarginMode(account.exchange_metadata?.margin_mode)
  leverageForms[account.id] = {
    symbols:
      account.exchange === ExchangeType.Hyperliquid && overrideSymbols.length > 0
        ? overrideSymbols.join(', ')
        : accounts.getDefaultSymbolForAccount(account.id),
    leverage:
      account.exchange === ExchangeType.Hyperliquid && overrideSymbols.length > 0
        ? (overrides[overrideSymbols[0]] ?? defaultLeverage)
        : defaultLeverage,
    defaultLeverage,
    marginMode,
  }
}

function normalizeHyperliquidMarginMode(value: string | null | undefined): 'cross' | 'isolated' {
  return value?.trim().toLowerCase() === 'isolated' ? 'isolated' : 'cross'
}

function ensureBuilderForm(account: AccountRecord) {
  if (builderForms[account.id]) return
  const meta = account.exchange_metadata
  builderForms[account.id] = {
    feeBps: ((meta?.builder_fee_tenths_bps ?? 10) / 10).toString(),
  }
}

function ensureGuardForm(account: AccountRecord) {
  if (guardForms[account.id]) return
  const guards = resolveHyperliquidExecutionGuards(account.exchange_metadata)
  guardForms[account.id] = {
    entryPercent: tenthsBpsToPercent(guards.entry_market_tenths_bps),
    takeProfitPercent: tenthsBpsToPercent(guards.take_profit_market_tenths_bps),
    stopLossPercent: tenthsBpsToPercent(guards.stop_loss_market_tenths_bps),
  }
}

function canSaveHyperliquidGuards(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  const form = guardForms[account.id]
  if (!form || savingGuardAccountIds.value.has(account.id)) return false
  return (
    isValidExecutionGuardPercent(form.entryPercent) &&
    isValidExecutionGuardPercent(form.takeProfitPercent) &&
    isValidExecutionGuardPercent(form.stopLossPercent)
  )
}

async function saveHyperliquidGuards(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canSaveHyperliquidGuards(account)) {
    controlError.value = 'Hyperliquid execution guards must be between 0% and 50%.'
    return
  }
  const form = guardForms[account.id]
  savingGuardAccountIds.value = new Set([...savingGuardAccountIds.value, account.id])
  try {
    await accounts.updateAccountMetadata(account.id, {
      entry_market_guard_tenths_bps: percentToTenthsBps(form.entryPercent),
      take_profit_market_guard_tenths_bps: percentToTenthsBps(form.takeProfitPercent),
      stop_loss_market_guard_tenths_bps: percentToTenthsBps(form.stopLossPercent),
    })
    controlMessage.value = `Saved Hyperliquid execution guards for ${account.label}.`
  } catch (err) {
    controlError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(savingGuardAccountIds.value)
    next.delete(account.id)
    savingGuardAccountIds.value = next
  }
}

function marketContextForAccount(account: AccountRecord) {
  return accounts.getMarketContextForAccount(account.id)
}

function capabilitiesForAccount(account: AccountRecord): MarketCapabilitiesData | null {
  return ws.capabilitiesForMarketContext(marketContextForAccount(account))
}

function throttleForAccount(account: AccountRecord): OrderThrottleSnapshotData | null {
  return ws.orderThrottleForMarketContext(marketContextForAccount(account))
}

function symbolLeverageForAccount(account: AccountRecord) {
  return ws.symbolLeverageForMarketContext(marketContextForAccount(account))
}

function requestAccountCapabilities(account: AccountRecord) {
  if (ws.status !== 'ready') return
  const marketContext = marketContextForAccount(account)
  if (!marketContext) return
  requestedCapabilityAccountIds.value = new Set([
    ...requestedCapabilityAccountIds.value,
    account.id,
  ])
  ws.requestMarketCapabilities(marketContext)
}

function requestAccountThrottle(account: AccountRecord) {
  if (ws.status !== 'ready') return
  const marketContext = marketContextForAccount(account)
  if (!marketContext) return
  ws.requestOrderThrottleSnapshot(marketContext)
}

function requestVisibleCapabilities() {
  if (ws.status !== 'ready') return
  for (const account of accounts.accounts) {
    requestAccountCapabilities(account)
  }
}

function requestSelectedThrottle() {
  const account = accounts.selectedAccount
  if (!account) return
  requestAccountThrottle(account)
}

function capabilityStatus(account: AccountRecord): string {
  if (capabilitiesForAccount(account)) return 'Capabilities loaded'
  if (requestedCapabilityAccountIds.value.has(account.id)) return 'Capabilities pending'
  if (ws.status !== 'ready') return 'Server offline'
  return 'Capabilities not loaded'
}

function validateLeverage(account: AccountRecord): boolean {
  const capabilities = capabilitiesForAccount(account)
  const form = leverageForms[account.id]
  if (!capabilities?.supports_leverage) return false
  if (!form) return false
  const symbols = parseLeverageSymbols(account, form.symbols)
  if (symbols.length === 0) return false
  if (!Number.isFinite(form.leverage) || form.leverage <= 0) return false
  return ws.status === 'ready'
}

function canSaveHyperliquidLeveragePrefs(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  const form = leverageForms[account.id]
  if (!form) return false
  if (!Number.isInteger(form.defaultLeverage) || form.defaultLeverage < 1) return false
  if (!Number.isInteger(form.leverage) || form.leverage < 1) return false
  if (form.marginMode !== 'cross' && form.marginMode !== 'isolated') return false
  return true
}

function canCheckLeverage(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Bybit) return false
  const marketContext = marketContextForAccount(account)
  const form = leverageForms[account.id]
  if (!marketContext || !form) return false
  if (parseLeverageSymbols(account, form.symbols).length === 0) return false
  return ws.status === 'ready'
}

function canSetHedgeMode(account: AccountRecord): boolean {
  const capabilities = capabilitiesForAccount(account)
  return ws.status === 'ready' && !!capabilities?.supports_hedge_mode
}

function builderFeeTenthsBps(account: AccountRecord): number | null {
  const parsed = Number(builderForms[account.id]?.feeBps)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 10)
}

function builderFeeEquivalent(account: AccountRecord): string {
  const fee = builderFeeTenthsBps(account)
  if (fee == null || fee > 100) return 'Invalid'
  return `${(fee / 10).toFixed(1)} bps = ${(fee / 1000).toFixed(3)}%`
}

function approvedBuilderMaxLabel(account: AccountRecord): string {
  const meta = account.exchange_metadata
  if (meta?.builder_approved !== true) return 'not verified'
  return `${((meta.max_builder_fee_tenths_bps ?? 0) / 10).toFixed(1)} bps`
}

function canSaveHyperliquidBuilder(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  const fee = builderFeeTenthsBps(account)
  if (fee == null || fee > 100) return false
  return !savingBuilderAccountIds.value.has(account.id)
}

function canApproveHyperliquidBuilder(account: AccountRecord): boolean {
  if (!canSaveHyperliquidBuilder(account)) return false
  const fee = builderFeeTenthsBps(account)
  if (!fee || fee <= 0) return false
  return (
    Boolean(
      account.exchange_metadata?.user_address && account.exchange_metadata?.builder_address,
    ) && !approvingBuilderAccountIds.value.has(account.id)
  )
}

function canRefreshHyperliquidBuilder(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  if (refreshingBuilderAccountIds.value.has(account.id)) return false
  if (!account.exchange_metadata?.user_address) return false
  const fee = account.exchange_metadata?.builder_fee_tenths_bps ?? 0
  if (fee <= 0) return true
  return Boolean(account.exchange_metadata?.builder_address)
}

function canApproveHyperliquidAgent(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  if (approvingAgentAccountIds.value.has(account.id)) return false
  return Boolean(
    account.exchange_metadata?.user_address && account.exchange_metadata?.agent_address,
  )
}

function canRefreshHyperliquidAgent(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  if (refreshingAgentAccountIds.value.has(account.id)) return false
  return Boolean(
    account.exchange_metadata?.user_address && account.exchange_metadata?.agent_address,
  )
}

async function saveHyperliquidBuilder(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canSaveHyperliquidBuilder(account)) {
    controlError.value = 'Hyperliquid builder settings are invalid.'
    return
  }
  const fee = builderFeeTenthsBps(account)
  if (fee == null) return
  savingBuilderAccountIds.value = new Set([...savingBuilderAccountIds.value, account.id])
  try {
    await accounts.updateAccountMetadata(account.id, {
      builder_fee_tenths_bps: fee,
    })
    controlMessage.value = `Saved Hyperliquid builder settings for ${account.label}.`
  } catch (err) {
    controlError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(savingBuilderAccountIds.value)
    next.delete(account.id)
    savingBuilderAccountIds.value = next
  }
}

async function approveHyperliquidAgent(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canApproveHyperliquidAgent(account)) {
    controlError.value =
      'Hyperliquid agent approval requires a saved user wallet and agent address.'
    return
  }
  const userAddress = account.exchange_metadata?.user_address
  const agentAddress = account.exchange_metadata?.agent_address
  if (!userAddress || !agentAddress) return
  approvingAgentAccountIds.value = new Set([...approvingAgentAccountIds.value, account.id])
  try {
    const signed = await signHyperliquidAgentApproval({
      network: account.network,
      userAddress,
      agentAddress,
      agentName: 'trad',
    })
    const response = await accounts.approveHyperliquidAgent(account.id, {
      ...signed,
      agent_address: agentAddress,
      agent_name: signed.action.agentName,
    })
    controlMessage.value = response.agent_approved
      ? `Hyperliquid agent wallet approved for ${account.label}.`
      : `Hyperliquid accepted the approval, but the agent was not visible in extraAgents yet. Refresh again shortly.`
  } catch (err) {
    controlError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(approvingAgentAccountIds.value)
    next.delete(account.id)
    approvingAgentAccountIds.value = next
  }
}

async function refreshHyperliquidAgent(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canRefreshHyperliquidAgent(account)) {
    controlError.value = 'Hyperliquid agent refresh requires a saved user wallet and agent address.'
    return
  }
  refreshingAgentAccountIds.value = new Set([...refreshingAgentAccountIds.value, account.id])
  try {
    const response = await accounts.refreshHyperliquidAgentApproval(account.id)
    controlMessage.value = response.agent_approved
      ? `Hyperliquid agent wallet is approved for ${account.label}.`
      : `Hyperliquid agent wallet is not approved for ${account.label}.`
  } catch (err) {
    controlError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(refreshingAgentAccountIds.value)
    next.delete(account.id)
    refreshingAgentAccountIds.value = next
  }
}

async function approveHyperliquidBuilder(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canApproveHyperliquidBuilder(account)) {
    controlError.value =
      'Hyperliquid builder approval requires a user address, builder address, and fee above 0.'
    return
  }
  const fee = builderFeeTenthsBps(account)
  const userAddress = account.exchange_metadata?.user_address
  const builderAddress = account.exchange_metadata?.builder_address
  if (fee == null || !userAddress || !builderAddress) return
  approvingBuilderAccountIds.value = new Set([...approvingBuilderAccountIds.value, account.id])
  try {
    const signed = await signHyperliquidBuilderApproval({
      network: account.network,
      userAddress,
      builderAddress,
    })
    const response = await accounts.approveHyperliquidBuilderFee(account.id, {
      ...signed,
      builder_address: builderAddress,
      builder_fee_tenths_bps: fee,
    })
    controlMessage.value = `Hyperliquid builder fee approved up to ${(response.max_builder_fee_tenths_bps / 10).toFixed(1)} bps for ${account.label}.`
  } catch (err) {
    controlError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(approvingBuilderAccountIds.value)
    next.delete(account.id)
    approvingBuilderAccountIds.value = next
  }
}

async function refreshHyperliquidBuilder(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canRefreshHyperliquidBuilder(account)) {
    controlError.value = 'Hyperliquid builder refresh requires saved user and builder addresses.'
    return
  }
  refreshingBuilderAccountIds.value = new Set([...refreshingBuilderAccountIds.value, account.id])
  try {
    const response = await accounts.refreshHyperliquidBuilderApproval(account.id)
    controlMessage.value = response.builder_approved
      ? `Hyperliquid builder approval covers ${(response.max_builder_fee_tenths_bps / 10).toFixed(1)} bps for ${account.label}.`
      : `Hyperliquid builder approval is below the configured fee for ${account.label}.`
  } catch (err) {
    controlError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(refreshingBuilderAccountIds.value)
    next.delete(account.id)
    refreshingBuilderAccountIds.value = next
  }
}

function setLeverage(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  const marketContext = marketContextForAccount(account)
  const form = leverageForms[account.id]
  if (!marketContext || !form || !validateLeverage(account)) {
    controlError.value = 'Leverage settings are unavailable for this account.'
    return
  }
  const symbols = parseLeverageSymbols(account, form.symbols)
  for (const symbol of symbols) {
    const payload: Extract<UserCommandPayload, { kind: 'SetLeverage' }> = {
      kind: 'SetLeverage',
      data: {
        symbol,
        leverage: form.leverage,
        market_context: marketContext,
        margin_mode: account.exchange === ExchangeType.Hyperliquid ? form.marginMode : null,
      },
    }
    ws.sendUserCommand(payload)
  }
  window.setTimeout(() => requestAccountLeverage(account), 2500)
  controlMessage.value =
    symbols.length === 1
      ? `Submitted leverage update for ${symbols[0]}.`
      : `Submitted leverage updates for ${symbols.length} symbols: ${summarizeSymbols(symbols)}.`
}

function requestAccountLeverage(account: AccountRecord) {
  controlError.value = null
  const marketContext = marketContextForAccount(account)
  const form = leverageForms[account.id]
  if (!marketContext || !form || account.exchange !== ExchangeType.Bybit) return
  const symbols = parseLeverageSymbols(account, form.symbols)
  if (symbols.length === 0) {
    controlError.value = 'Enter at least one Bybit USDT perpetual symbol.'
    return
  }
  if (ws.status !== 'ready') {
    controlError.value = 'Leverage check requires an active server connection.'
    return
  }
  refreshingLeverageAccountIds.value = new Set([...refreshingLeverageAccountIds.value, account.id])
  ws.requestSymbolLeverage(marketContext, symbols)
  window.setTimeout(() => {
    const next = new Set(refreshingLeverageAccountIds.value)
    next.delete(account.id)
    refreshingLeverageAccountIds.value = next
  }, 2500)
}

function parseLeverageSymbols(account: AccountRecord, raw: string): string[] {
  const tokens = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const symbols = tokens
    .map((token) => {
      if (account.exchange === ExchangeType.Bybit) {
        return isValidBybitUsdtSymbol(token) ? normalizeBybitUsdtSymbol(token) : ''
      }
      if (account.exchange === ExchangeType.Hyperliquid) {
        return normalizeHyperliquidPerpSymbol(token)
      }
      return token.toUpperCase()
    })
    .filter(Boolean)

  return [...new Set(symbols)]
}

async function saveHyperliquidLeveragePrefs(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canSaveHyperliquidLeveragePrefs(account)) {
    controlError.value = 'Hyperliquid leverage preferences are invalid.'
    return
  }
  const form = leverageForms[account.id]
  const symbols = parseLeverageSymbols(account, form.symbols)
  const overrides = symbols.reduce<Record<string, number>>((map, symbol) => {
    map[symbol] = form.leverage
    return map
  }, {})
  try {
    await accounts.updateAccountMetadata(account.id, {
      ...account.exchange_metadata,
      product: 'usdc_perp',
      hedge_mode_only: false,
      default_leverage: form.defaultLeverage,
      margin_mode: form.marginMode,
      symbol_leverage_overrides: overrides,
    })
    await accounts.fetchAccounts()
    controlMessage.value =
      symbols.length > 0
        ? `Saved Hyperliquid ${form.defaultLeverage}x default and ${symbols.length} symbol override${symbols.length === 1 ? '' : 's'}.`
        : `Saved Hyperliquid ${form.defaultLeverage}x default and cleared symbol overrides.`
  } catch (err) {
    controlError.value = err instanceof Error ? err.message : String(err)
  }
}

function summarizeSymbols(symbols: string[]): string {
  const shown = symbols.slice(0, 4).join(', ')
  return symbols.length > 4 ? `${shown}, ...` : shown
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function formatBybitRateLimit(snapshot: OrderThrottleSnapshotData | null): string {
  const rate = snapshot?.bybit_rate_limit
  if (!rate) return '-'
  const remaining = rate.remaining?.trim() || '-'
  const limit = rate.limit?.trim() || '-'
  return `${remaining}/${limit}`
}

function formatBybitRateLimitAge(snapshot: OrderThrottleSnapshotData | null): string {
  const observedAt = snapshot?.bybit_rate_limit?.observed_at_unix_ms
  if (!observedAt) return '-'
  return formatMs(Math.max(0, Date.now() - observedAt))
}

function formatBybitRateLimitReset(snapshot: OrderThrottleSnapshotData | null): string {
  const rate = snapshot?.bybit_rate_limit
  if (!rate) return ''
  if (rate.exhausted) {
    return `hold ${formatMs(rate.reset_in_ms)}`
  }
  if (rate.reset_in_ms != null && rate.reset_in_ms > 0) {
    return `reset ${formatMs(rate.reset_in_ms)}`
  }
  return ''
}

function formatLeverageValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '?'
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}x`
}

function formatSymbolLeverage(account: AccountRecord): string {
  const snapshot = symbolLeverageForAccount(account)
  if (!snapshot) return 'Not checked'
  const parts = snapshot.leverages.slice(0, 4).map((item) => {
    return `${item.symbol} L/S ${formatLeverageValue(item.long_leverage)} / ${formatLeverageValue(item.short_leverage)}`
  })
  if (snapshot.leverages.length > 4) parts.push(`+${snapshot.leverages.length - 4} more`)
  if (snapshot.unavailable_symbols.length > 0) {
    parts.push(`unknown ${snapshot.unavailable_symbols.slice(0, 3).join(',')}`)
  }
  return parts.length > 0 ? parts.join(' | ') : 'Unknown'
}

function enableHedgeMode(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  const marketContext = marketContextForAccount(account)
  if (!marketContext || !canSetHedgeMode(account)) {
    controlError.value = 'Hedge mode is unavailable for this account.'
    return
  }
  const payload: Extract<UserCommandPayload, { kind: 'SetHedgeMode' }> = {
    kind: 'SetHedgeMode',
    data: {
      enabled: true,
      market_context: marketContext,
    },
  }
  ws.sendUserCommand(payload)
  controlMessage.value = `Submitted hedge-mode enable for ${account.label}.`
}

onMounted(() => {
  if (!accounts.lastFetchedAt) {
    accounts.fetchAccounts().catch((err) => {
      logger.error('initial fetch failed', err)
    })
  }
  accounts.accounts.forEach(ensureLeverageForm)
  requestVisibleCapabilities()
  requestSelectedThrottle()
  throttleRefreshTimer = window.setInterval(requestSelectedThrottle, 2000)
})

onUnmounted(() => {
  if (throttleRefreshTimer != null) {
    window.clearInterval(throttleRefreshTimer)
    throttleRefreshTimer = null
  }
})

watch(
  () => accounts.accounts.map((account) => account.id).join('|'),
  () => {
    accounts.accounts.forEach(ensureLeverageForm)
    requestVisibleCapabilities()
  },
)

watch(
  () => ws.status,
  () => {
    requestVisibleCapabilities()
    requestSelectedThrottle()
  },
)

watch(
  () => accounts.selectedAccountId,
  () => {
    requestSelectedThrottle()
  },
)
</script>

<template>
  <section class="panel-card flex h-full flex-col">
    <div class="panel-header-row">
      <div class="inline-flex items-center gap-2">
        <span class="font-semibold tracking-[0.04em] text-primary">Trading Accounts</span>
        <span v-if="accounts.loading" class="pill pill-info">loading</span>
        <span v-else-if="accounts.error" class="pill pill-err">error</span>
      </div>
      <div class="inline-flex items-center gap-2">
        <button
          class="btn btn-secondary btn-xs"
          @click="refreshAccounts"
          :disabled="accounts.loading"
        >
          Refresh
        </button>
        <button class="btn btn-primary btn-xs" @click="openCreateModal">New</button>
      </div>
    </div>

    <div class="flex flex-1 flex-col gap-3 overflow-auto p-3">
      <p v-if="accounts.error" class="text-center text-xs text-error">
        {{ accounts.error }}
      </p>
      <p v-if="refreshError" class="text-center text-xs text-error">
        {{ refreshError }}
      </p>
      <p v-if="controlError" class="text-center text-xs text-error">
        {{ controlError }}
      </p>
      <p v-if="controlMessage" class="text-center text-xs text-[var(--color-success)]">
        {{ controlMessage }}
      </p>

      <p
        v-else-if="accounts.loading && accounts.accounts.length === 0"
        class="text-center text-xs dim"
      >
        Loading accounts...
      </p>

      <p v-else-if="accounts.accounts.length === 0" class="text-center text-xs dim">
        No accounts configured yet.
      </p>

      <ul v-else class="flex flex-col gap-2">
        <li
          v-for="account in sortedAccounts"
          :key="account.id"
          :class="[
            'flex items-center gap-2 border border-[var(--panel-border-inner)] bg-[color-mix(in_srgb,var(--panel-bg)_95%,transparent)] transition-colors',
            {
              'border-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_18%,var(--panel-bg))]':
                accounts.selectedAccountId === account.id,
            },
          ]"
          :style="{ borderRadius: 'var(--radius-base)' }"
        >
          <div class="flex flex-1 items-center justify-between gap-3 px-3 py-2">
            <div class="flex flex-1 flex-col gap-2">
              <button
                class="flex flex-col items-start gap-2 text-left"
                type="button"
                @click="selectAccount(account)"
                :aria-pressed="accounts.selectedAccountId === account.id"
              >
                <span class="text-sm font-medium text-primary">
                  {{ account.label }}
                </span>
                <span class="flex flex-wrap items-center gap-2 text-[11px] dim">
                  <span v-for="chip in accountMetadataChips(account)" :key="chip" class="chip">
                    {{ chip }}
                  </span>
                  <span
                    v-if="accounts.selectedAccountId === account.id"
                    class="pill pill-info text-[10px] uppercase tracking-[0.08em]"
                  >
                    Active
                  </span>
                  <span
                    v-if="accounts.selectedAccountId === account.id"
                    class="pill pill-xs text-[10px]"
                  >
                    {{ capabilityStatus(account) }}
                  </span>
                </span>
                <span
                  v-if="accountMetadataStatus(account)"
                  class="text-[11px]"
                  :class="
                    isBybitMetadataVerified(account)
                      ? 'text-[var(--color-success)]'
                      : 'text-warning'
                  "
                >
                  {{ accountMetadataStatus(account) }}
                </span>
              </button>

              <div
                v-if="accounts.selectedAccountId === account.id"
                class="grid gap-2 border-t border-[var(--panel-border-inner)] pt-2 md:grid-cols-[minmax(132px,1fr)_96px_auto_auto_auto]"
              >
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>{{ account.exchange === ExchangeType.Bybit ? 'Symbols' : 'Symbol' }}</span>
                  <input
                    v-model.trim="leverageForms[account.id].symbols"
                    class="input h-7 text-xs"
                    spellcheck="false"
                    :placeholder="
                      account.exchange === ExchangeType.Bybit
                        ? 'BTC, ETH, SOL'
                        : account.exchange === ExchangeType.Hyperliquid
                          ? 'BTC'
                          : 'BTCUSDT or ALL'
                    "
                    @focus="ensureLeverageForm(account)"
                  />
                  <span
                    v-if="account.exchange === ExchangeType.Bybit"
                    class="normal-case tracking-normal text-[var(--color-text-dim)]"
                  >
                    Comma or space separated; applied per symbol.
                  </span>
                  <span
                    v-else-if="account.exchange === ExchangeType.Hyperliquid"
                    class="normal-case tracking-normal text-[var(--color-text-dim)]"
                  >
                    Optional persisted overrides; blank clears overrides.
                  </span>
                </label>
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Lev</span>
                  <input
                    v-model.number="leverageForms[account.id].leverage"
                    class="input h-7 text-xs"
                    type="number"
                    min="1"
                    step="1"
                    @focus="ensureLeverageForm(account)"
                  />
                </label>
                <label
                  v-if="account.exchange === ExchangeType.Hyperliquid"
                  class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim"
                >
                  <span>Default</span>
                  <input
                    v-model.number="leverageForms[account.id].defaultLeverage"
                    class="input h-7 text-xs"
                    type="number"
                    min="1"
                    step="1"
                    @focus="ensureLeverageForm(account)"
                  />
                </label>
                <label
                  v-if="account.exchange === ExchangeType.Hyperliquid"
                  class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim"
                >
                  <span>Mode</span>
                  <select
                    v-model="leverageForms[account.id].marginMode"
                    class="input h-7 text-xs"
                    @focus="ensureLeverageForm(account)"
                  >
                    <option value="cross">Cross</option>
                    <option value="isolated">Isolated</option>
                  </select>
                </label>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!validateLeverage(account)"
                  @click="setLeverage(account)"
                >
                  Set Leverage
                </button>
                <button
                  v-if="account.exchange === ExchangeType.Hyperliquid"
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canSaveHyperliquidLeveragePrefs(account)"
                  @click="saveHyperliquidLeveragePrefs(account)"
                >
                  Save Prefs
                </button>
                <button
                  v-if="account.exchange === ExchangeType.Bybit"
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="
                    !canCheckLeverage(account) || refreshingLeverageAccountIds.has(account.id)
                  "
                  @click="requestAccountLeverage(account)"
                >
                  Check Lev
                </button>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canSetHedgeMode(account)"
                  @click="enableHedgeMode(account)"
                >
                  Enable Hedge
                </button>
              </div>
              <p
                v-if="
                  accounts.selectedAccountId === account.id &&
                  account.exchange === ExchangeType.Hyperliquid
                "
                class="m-0 text-[11px] leading-relaxed text-[var(--color-text-dim)]"
              >
                Hyperliquid leverage is one-way per-symbol exchange state. Save prefs records the
                account default, margin mode, and symbol overrides in Trad; Set Leverage applies the
                current leverage and margin mode to the exchange for the symbols entered above.
              </p>
              <div
                v-if="
                  accounts.selectedAccountId === account.id &&
                  account.exchange === ExchangeType.Hyperliquid
                "
                class="grid gap-2 border-t border-[var(--panel-border-inner)] pt-2 md:grid-cols-[repeat(3,minmax(110px,1fr))_auto]"
              >
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Market Entry Guard</span>
                  <input
                    v-model.number="guardForms[account.id].entryPercent"
                    class="input h-7 text-xs"
                    type="number"
                    min="0"
                    max="50"
                    step="0.001"
                    @focus="ensureGuardForm(account)"
                  />
                  <span class="normal-case tracking-normal text-[var(--color-text-dim)]"
                    >Percent</span
                  >
                </label>
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Market TP Guard</span>
                  <input
                    v-model.number="guardForms[account.id].takeProfitPercent"
                    class="input h-7 text-xs"
                    type="number"
                    min="0"
                    max="50"
                    step="0.001"
                    @focus="ensureGuardForm(account)"
                  />
                  <span class="normal-case tracking-normal text-[var(--color-text-dim)]"
                    >Percent</span
                  >
                </label>
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Market SL Guard</span>
                  <input
                    v-model.number="guardForms[account.id].stopLossPercent"
                    class="input h-7 text-xs"
                    type="number"
                    min="0"
                    max="50"
                    step="0.001"
                    @focus="ensureGuardForm(account)"
                  />
                  <span class="normal-case tracking-normal text-[var(--color-text-dim)]"
                    >Percent</span
                  >
                </label>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canSaveHyperliquidGuards(account)"
                  @click="saveHyperliquidGuards(account)"
                >
                  <span v-if="savingGuardAccountIds.has(account.id)">Saving</span>
                  <span v-else>Save Guards</span>
                </button>
                <p
                  class="m-0 text-[11px] leading-relaxed text-[var(--color-text-dim)] md:col-span-4"
                >
                  Account defaults bound the worst executable price for market entry, take profit,
                  and stop loss orders. Each command records its effective values permanently.
                </p>
              </div>
              <p
                v-if="
                  accounts.selectedAccountId === account.id &&
                  account.exchange === ExchangeType.Bybit
                "
                class="m-0 text-[11px] leading-relaxed text-[var(--color-text-dim)]"
              >
                Current Lev:
                <span class="font-mono text-primary">{{ formatSymbolLeverage(account) }}</span>
                <br />
                Bybit leverage is persistent per-symbol exchange state. Attached TP/SL is
                exchange-managed after acceptance, but fills remain subject to liquidity, gaps, and
                liquidation risk.
              </p>
              <div
                v-if="
                  accounts.selectedAccountId === account.id &&
                  account.exchange === ExchangeType.Hyperliquid
                "
                class="grid gap-2 border-t border-[var(--panel-border-inner)] pt-2 md:grid-cols-[minmax(190px,1fr)_auto_auto]"
              >
                <div class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Agent Wallet</span>
                  <span class="break-all font-mono text-primary normal-case tracking-normal">
                    {{ account.exchange_metadata?.agent_address || 'missing' }}
                  </span>
                  <span class="normal-case tracking-normal text-[var(--color-text-dim)]">
                    Status:
                    <span class="font-mono text-primary">
                      {{ account.exchange_metadata?.agent_approved ? 'approved' : 'unvalidated' }}
                    </span>
                  </span>
                </div>
                <button
                  class="btn btn-primary btn-xs self-end"
                  type="button"
                  :disabled="!canApproveHyperliquidAgent(account)"
                  @click="approveHyperliquidAgent(account)"
                >
                  <span v-if="approvingAgentAccountIds.has(account.id)">Approving</span>
                  <span v-else>Approve Agent</span>
                </button>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canRefreshHyperliquidAgent(account)"
                  @click="refreshHyperliquidAgent(account)"
                >
                  <span v-if="refreshingAgentAccountIds.has(account.id)">Refreshing</span>
                  <span v-else>Refresh Agent</span>
                </button>
              </div>
              <div
                v-if="
                  accounts.selectedAccountId === account.id &&
                  account.exchange === ExchangeType.Hyperliquid
                "
                class="grid gap-2 border-t border-[var(--panel-border-inner)] pt-2 md:grid-cols-[minmax(190px,1fr)_96px_auto_auto_auto]"
              >
                <div
                  class="flex min-w-0 flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim"
                >
                  <span>Builder Address</span>
                  <span
                    class="break-all font-mono text-xs text-primary normal-case tracking-normal"
                  >
                    {{
                      account.exchange_metadata?.builder_address ||
                      'not configured for this network'
                    }}
                  </span>
                  <span class="normal-case tracking-normal text-[var(--color-text-dim)]">
                    Trad-controlled recipient. Wallet approval requests the 10 bps / 0.1% maximum.
                  </span>
                </div>
                <label class="flex flex-col gap-1 text-[10px] uppercase tracking-[0.06em] dim">
                  <span>Fee</span>
                  <input
                    v-model.trim="builderForms[account.id].feeBps"
                    class="input h-7 text-xs"
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    @focus="ensureBuilderForm(account)"
                  />
                  <span class="normal-case tracking-normal text-[var(--color-text-dim)]">
                    {{ builderFeeEquivalent(account) }}
                  </span>
                </label>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canSaveHyperliquidBuilder(account)"
                  @click="saveHyperliquidBuilder(account)"
                >
                  <span v-if="savingBuilderAccountIds.has(account.id)">Saving</span>
                  <span v-else>Save</span>
                </button>
                <button
                  class="btn btn-primary btn-xs self-end"
                  type="button"
                  :disabled="!canApproveHyperliquidBuilder(account)"
                  @click="approveHyperliquidBuilder(account)"
                >
                  <span v-if="approvingBuilderAccountIds.has(account.id)">Approving</span>
                  <span v-else>Approve</span>
                </button>
                <button
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canRefreshHyperliquidBuilder(account)"
                  @click="refreshHyperliquidBuilder(account)"
                >
                  <span v-if="refreshingBuilderAccountIds.has(account.id)">Refreshing</span>
                  <span v-else>Refresh</span>
                </button>
                <p
                  class="m-0 text-[11px] leading-relaxed text-[var(--color-text-dim)] md:col-span-5"
                >
                  Approved max:
                  <span class="font-mono text-primary">
                    {{ approvedBuilderMaxLabel(account) }}
                  </span>
                  · Status:
                  <span class="font-mono text-primary">
                    {{ account.exchange_metadata?.builder_approved ? 'approved' : 'unvalidated' }}
                  </span>
                </p>
              </div>
              <div
                v-if="accounts.selectedAccountId === account.id"
                class="grid gap-2 text-[10px] uppercase tracking-[0.06em] dim sm:grid-cols-4 xl:grid-cols-8"
              >
                <div class="flex flex-col gap-1">
                  <span>Queue</span>
                  <span class="font-mono text-primary">
                    {{ throttleForAccount(account)?.total_queued ?? 0 }} queued /
                    {{ throttleForAccount(account)?.total_in_flight ?? 0 }} live
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Oldest</span>
                  <span class="font-mono text-primary">
                    {{ formatMs(throttleForAccount(account)?.accounts[0]?.oldest_queued_age_ms) }}
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Drain Est</span>
                  <span class="font-mono text-primary">
                    {{ formatMs(throttleForAccount(account)?.accounts[0]?.estimated_drain_ms) }}
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Errors</span>
                  <span class="font-mono text-primary">
                    {{ throttleForAccount(account)?.errored_total ?? 0 }} err /
                    {{ throttleForAccount(account)?.canceled_total ?? 0 }} cancel
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Stale</span>
                  <span class="font-mono text-primary">
                    {{ throttleForAccount(account)?.stale_rejected_total ?? 0 }}
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Rate Limit</span>
                  <span class="font-mono text-primary">
                    {{ throttleForAccount(account)?.rate_limit_rejected_total ?? 0 }}
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Delayed</span>
                  <span class="font-mono text-primary">
                    {{ throttleForAccount(account)?.delayed_by_limiter_total ?? 0 }}
                  </span>
                </div>
                <div class="flex flex-col gap-1">
                  <span>Bybit Remain</span>
                  <span class="font-mono text-primary">
                    {{ formatBybitRateLimit(throttleForAccount(account)) }}
                    <span class="dim normal-case">
                      {{ formatBybitRateLimitAge(throttleForAccount(account)) }}
                      {{ formatBybitRateLimitReset(throttleForAccount(account)) }}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <button
              class="btn btn-secondary btn-xs"
              type="button"
              title="Refresh credentials and exchange metadata"
              :disabled="ws.status !== 'ready' || refreshingAccountIds.has(account.id)"
              @click="refreshAccountKeys(account)"
            >
              Refresh
            </button>
            <button
              class="btn icon-btn btn-sm"
              type="button"
              title="Delete"
              @click="deleteAccount(account)"
            >
              <X :size="12" />
            </button>
          </div>
        </li>
      </ul>
    </div>
    <CreateAccountModal :open="isCreateModalOpen" @close="isCreateModalOpen = false" />
  </section>
</template>
