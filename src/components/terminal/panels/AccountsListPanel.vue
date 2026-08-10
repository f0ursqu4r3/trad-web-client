<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  accountMetadataChips,
  accountMetadataStatus,
  isBybitMetadataVerified,
  isHyperliquidMetadataReady,
  useAccountsStore,
  type AccountRecord,
} from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import CreateAccountModal from '@/components/terminal/modals/CreateAccountModal.vue'
import ActionConfirmationModal from '@/components/terminal/modals/ActionConfirmationModal.vue'
import { X } from 'lucide-vue-next'
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
  HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS,
  hyperliquidTargetTotalTenthsBps,
} from '@/lib/accountMetadata'
import { HYPERLIQUID_MAX_BUILDER_FEE_TENTHS_BPS } from '@/lib/hyperliquidBuilderApproval'
import {
  isValidExecutionGuardPercent,
  percentToTenthsBps,
  resolveHyperliquidExecutionGuards,
  tenthsBpsToPercent,
} from '@/lib/hyperliquidExecutionGuards'
import { ExchangeType } from '@/lib/ws/protocol'

const logger = createLogger('accounts')

const props = withDefaults(
  defineProps<{
    mode?: 'full' | 'compact' | 'detail'
    detailAccountId?: string | null
  }>(),
  {
    mode: 'full',
    detailAccountId: null,
  },
)
const emit = defineEmits<{
  (event: 'manage', accountId: string): void
}>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const projections = useAccountProjectionStore()

const isCreateModalOpen = ref(false)
const approvingBuilderAccountIds = ref<Set<string>>(new Set())
const savingBuilderAccountIds = ref<Set<string>>(new Set())
const savingGuardAccountIds = ref<Set<string>>(new Set())
const refreshingBuilderAccountIds = ref<Set<string>>(new Set())
const approvingAgentAccountIds = ref<Set<string>>(new Set())
const refreshingAgentAccountIds = ref<Set<string>>(new Set())
const controlError = ref<string | null>(null)
const controlMessage = ref<string | null>(null)
const deletionTarget = ref<AccountRecord | null>(null)
const deletingAccountIds = ref<Set<string>>(new Set())
type ApprovalFeedback = { kind: 'info' | 'success' | 'error'; message: string }
const agentApprovalFeedback = reactive<Record<string, ApprovalFeedback | undefined>>({})
const builderApprovalFeedback = reactive<Record<string, ApprovalFeedback | undefined>>({})
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
const builderForms = reactive<Record<string, { targetTotalBps: string }>>({})
const guardForms = reactive<
  Record<string, { entryPercent: number; takeProfitPercent: number; stopLossPercent: number }>
>({})
const sortedAccounts = computed(() => {
  accounts.accounts.forEach(ensureLeverageForm)
  accounts.accounts.forEach(ensureBuilderForm)
  accounts.accounts.forEach(ensureGuardForm)
  const sorted = accounts.accounts.slice().sort((a, b) => a.label.localeCompare(b.label))
  if (props.mode !== 'detail' || !props.detailAccountId) return sorted
  return sorted.filter((account) => account.id === props.detailAccountId)
})

function accountReady(account: AccountRecord): boolean {
  return account.exchange === ExchangeType.Hyperliquid
    ? isHyperliquidMetadataReady(account)
    : isBybitMetadataVerified(account)
}

function accountStatusClass(account: AccountRecord): string {
  const ready =
    account.exchange === ExchangeType.Hyperliquid
      ? isHyperliquidMetadataReady(account)
      : isBybitMetadataVerified(account)
  return ready ? 'text-[var(--color-success)]' : 'text-warning'
}

function hyperliquidTradingTarget(account: AccountRecord): string {
  return (
    account.exchange_metadata?.vault_address || account.exchange_metadata?.user_address || 'missing'
  )
}

function openCreateModal() {
  isCreateModalOpen.value = true
}

function requestAccountDeletion(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  deletionTarget.value = account
}

async function confirmAccountDeletion() {
  const account = deletionTarget.value
  if (!account) return
  deletionTarget.value = null
  deletingAccountIds.value = new Set(deletingAccountIds.value).add(account.id)
  try {
    const result = await accounts.removeAccount(account.label)
    controlMessage.value =
      result.owner_release === 'completed'
        ? `Deleted ${account.label}.`
        : `Deleted ${account.label}; owner cleanup is completing in the background.`
  } catch (err) {
    logger.error('delete failed', err)
    controlError.value = err instanceof Error ? err.message : String(err)
  } finally {
    const next = new Set(deletingAccountIds.value)
    next.delete(account.id)
    deletingAccountIds.value = next
  }
}

function selectAccount(account: AccountRecord) {
  accounts.selectedAccountId = account.id
  ensureLeverageForm(account)
  ensureBuilderForm(account)
  ensureGuardForm(account)
}

function manageAccount(account: AccountRecord) {
  selectAccount(account)
  emit('manage', account.id)
}

function showAccountDetails(account: AccountRecord): boolean {
  return props.mode !== 'compact' && accounts.selectedAccountId === account.id
}

async function refreshAccounts() {
  await accounts.fetchAccounts()
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
    targetTotalBps: (hyperliquidTargetTotalTenthsBps(meta) / 10).toString(),
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

function validateLeverage(account: AccountRecord): boolean {
  const form = leverageForms[account.id]
  if (!supportsLeverageControl(account)) return false
  if (!form) return false
  const symbols = parseLeverageSymbols(account, form.symbols)
  if (symbols.length === 0) return false
  if (!Number.isInteger(form.leverage) || form.leverage <= 0) return false
  return gateway.isConnected
}

function supportsLeverageControl(account: AccountRecord): boolean {
  return (
    account.exchange === ExchangeType.Binance ||
    account.exchange === ExchangeType.Bybit ||
    account.exchange === ExchangeType.Hyperliquid
  )
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

function canSetHedgeMode(account: AccountRecord): boolean {
  return (
    gateway.isConnected &&
    (account.exchange === ExchangeType.Binance || account.exchange === ExchangeType.Bybit)
  )
}

function targetTotalTenthsBps(account: AccountRecord): number | null {
  const parsed = Number(builderForms[account.id]?.targetTotalBps)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 10)
}

function targetTotalEquivalent(account: AccountRecord): string {
  const target = targetTotalTenthsBps(account)
  if (target == null || target > HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS) return 'Invalid'
  return `${(target / 10).toFixed(1)} bps = ${(target / 1000).toFixed(3)}%`
}

function approvedBuilderMaxLabel(account: AccountRecord): string {
  const meta = account.exchange_metadata
  if (meta?.builder_approved !== true) return 'not verified'
  return `${((meta.max_builder_fee_tenths_bps ?? 0) / 10).toFixed(1)} bps`
}

function canSaveHyperliquidBuilder(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  if (account.exchange_metadata?.builder_fee_manager !== true) return false
  const target = targetTotalTenthsBps(account)
  if (target == null || target > HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS) return false
  return !savingBuilderAccountIds.value.has(account.id)
}

function canApproveHyperliquidBuilder(account: AccountRecord): boolean {
  if (account.exchange !== ExchangeType.Hyperliquid) return false
  const target = hyperliquidTargetTotalTenthsBps(account.exchange_metadata)
  if (target <= 0) return false
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
  const target = hyperliquidTargetTotalTenthsBps(account.exchange_metadata)
  if (target <= 0) return true
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
  const target = targetTotalTenthsBps(account)
  if (target == null) return
  savingBuilderAccountIds.value = new Set([...savingBuilderAccountIds.value, account.id])
  try {
    await accounts.updateAccountMetadata(account.id, {
      builder_target_total_tenths_bps: target,
    })
    controlMessage.value = `Saved Hyperliquid target total for ${account.label}.`
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
  agentApprovalFeedback[account.id] = {
    kind: 'info',
    message: 'Waiting for the wallet signature.',
  }
  if (!canApproveHyperliquidAgent(account)) {
    const message = 'Hyperliquid agent approval requires a saved user wallet and agent address.'
    agentApprovalFeedback[account.id] = { kind: 'error', message }
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
    const message = response.agent_approved
      ? `Hyperliquid agent wallet approved for ${account.label}.`
      : `Hyperliquid accepted the approval, but the agent was not visible in extraAgents yet. Refresh again shortly.`
    agentApprovalFeedback[account.id] = {
      kind: response.agent_approved ? 'success' : 'info',
      message,
    }
  } catch (err) {
    const message = approvalErrorMessage(err)
    agentApprovalFeedback[account.id] = { kind: 'error', message }
  } finally {
    const next = new Set(approvingAgentAccountIds.value)
    next.delete(account.id)
    approvingAgentAccountIds.value = next
  }
}

async function refreshHyperliquidAgent(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  agentApprovalFeedback[account.id] = {
    kind: 'info',
    message: 'Checking agent approval with Hyperliquid.',
  }
  if (!canRefreshHyperliquidAgent(account)) {
    const message = 'Hyperliquid agent refresh requires a saved user wallet and agent address.'
    agentApprovalFeedback[account.id] = { kind: 'error', message }
    return
  }
  refreshingAgentAccountIds.value = new Set([...refreshingAgentAccountIds.value, account.id])
  try {
    const response = await accounts.refreshHyperliquidAgentApproval(account.id)
    const message = response.agent_approved
      ? `Hyperliquid agent wallet is approved for ${account.label}.`
      : `Hyperliquid agent wallet is not approved for ${account.label}.`
    agentApprovalFeedback[account.id] = {
      kind: response.agent_approved ? 'success' : 'error',
      message,
    }
  } catch (err) {
    const message = approvalErrorMessage(err)
    agentApprovalFeedback[account.id] = { kind: 'error', message }
  } finally {
    const next = new Set(refreshingAgentAccountIds.value)
    next.delete(account.id)
    refreshingAgentAccountIds.value = next
  }
}

async function approveHyperliquidBuilder(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  builderApprovalFeedback[account.id] = {
    kind: 'info',
    message: 'Waiting for the wallet signature.',
  }
  if (!canApproveHyperliquidBuilder(account)) {
    const message =
      'Hyperliquid builder approval requires a user address, builder address, and fee above 0.'
    builderApprovalFeedback[account.id] = { kind: 'error', message }
    return
  }
  const userAddress = account.exchange_metadata?.user_address
  const builderAddress = account.exchange_metadata?.builder_address
  if (!userAddress || !builderAddress) return
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
      builder_fee_tenths_bps: HYPERLIQUID_MAX_BUILDER_FEE_TENTHS_BPS,
    })
    const message = `Hyperliquid builder fee approved up to ${(response.max_builder_fee_tenths_bps / 10).toFixed(1)} bps for ${account.label}.`
    builderApprovalFeedback[account.id] = {
      kind: 'success',
      message,
    }
  } catch (err) {
    const message = approvalErrorMessage(err)
    builderApprovalFeedback[account.id] = { kind: 'error', message }
  } finally {
    const next = new Set(approvingBuilderAccountIds.value)
    next.delete(account.id)
    approvingBuilderAccountIds.value = next
  }
}

async function refreshHyperliquidBuilder(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  builderApprovalFeedback[account.id] = {
    kind: 'info',
    message: 'Checking builder approval with Hyperliquid.',
  }
  if (!canRefreshHyperliquidBuilder(account)) {
    const message = 'Hyperliquid builder refresh requires saved user and builder addresses.'
    builderApprovalFeedback[account.id] = { kind: 'error', message }
    return
  }
  refreshingBuilderAccountIds.value = new Set([...refreshingBuilderAccountIds.value, account.id])
  try {
    const response = await accounts.refreshHyperliquidBuilderApproval(account.id)
    const message = response.builder_approved
      ? `Hyperliquid builder approval covers ${(response.max_builder_fee_tenths_bps / 10).toFixed(1)} bps for ${account.label}.`
      : `Hyperliquid builder approval is below the configured fee for ${account.label}.`
    builderApprovalFeedback[account.id] = {
      kind: response.builder_approved ? 'success' : 'error',
      message,
    }
  } catch (err) {
    const message = approvalErrorMessage(err)
    builderApprovalFeedback[account.id] = { kind: 'error', message }
  } finally {
    const next = new Set(refreshingBuilderAccountIds.value)
    next.delete(account.id)
    refreshingBuilderAccountIds.value = next
  }
}

function approvalFeedbackClass(feedback: ApprovalFeedback): string {
  if (feedback.kind === 'success') return 'text-[var(--color-success)]'
  if (feedback.kind === 'error') return 'text-error'
  return 'text-[var(--color-text-dim)]'
}

function approvalErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Must deposit before performing actions')) {
    return 'Hyperliquid requires this wallet to receive account funds before it will accept approval actions. Fund the wallet on this network, then try again.'
  }
  return message
}

async function setLeverage(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  const form = leverageForms[account.id]
  if (!form || !validateLeverage(account)) {
    controlError.value = 'Leverage settings are unavailable for this account.'
    return
  }
  const symbols = parseLeverageSymbols(account, form.symbols)
  try {
    for (const symbol of symbols) {
      const outcome = await gateway.submitCommand(
        {
          kind: 'set_leverage',
          parameters: {
            symbol,
            leverage: form.leverage,
            ...(account.exchange === ExchangeType.Hyperliquid
              ? { margin_mode: form.marginMode }
              : {}),
          },
        },
        account.id,
      )
      if (outcome.kind === 'rejected') throw new Error(outcome.rejection.reason)
    }
    controlMessage.value =
      symbols.length === 1
        ? `Applying leverage update for ${symbols[0]}.`
        : `Applying leverage updates for ${symbols.length} symbols: ${summarizeSymbols(symbols)}.`
  } catch (error) {
    controlError.value = error instanceof Error ? error.message : String(error)
  }
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

async function enableHedgeMode(account: AccountRecord) {
  controlError.value = null
  controlMessage.value = null
  if (!canSetHedgeMode(account)) {
    controlError.value = 'Hedge mode is unavailable for this account.'
    return
  }
  try {
    const outcome = await gateway.submitCommand(
      { kind: 'set_position_mode', parameters: { mode: 'hedge' } },
      account.id,
    )
    if (outcome.kind === 'rejected') throw new Error(outcome.rejection.reason)
    controlMessage.value = `Applying hedge-mode enable for ${account.label}.`
  } catch (error) {
    controlError.value = error instanceof Error ? error.message : String(error)
  }
}

function projectedAccountControls(account: AccountRecord) {
  if (accounts.selectedAccountId !== account.id) return []
  const acceptedAt = new Map(
    (projections.selectedLive?.commands ?? []).map((command) => [
      command.command_id,
      command.accepted_at,
    ]),
  )
  return (projections.selectedLive?.account_controls ?? [])
    .slice()
    .sort((left, right) => {
      const timestamp =
        (acceptedAt.get(right.command_id) ?? 0) - (acceptedAt.get(left.command_id) ?? 0)
      return timestamp || right.control_id.localeCompare(left.control_id)
    })
    .slice(0, 5)
}

function controlLabel(control: ReturnType<typeof projectedAccountControls>[number]): string {
  if (control.request.kind === 'set_position_mode') {
    return `Position mode: ${control.request.mode}`
  }
  const margin = control.request.margin_mode ? ` ${control.request.margin_mode}` : ''
  return `${control.request.symbol}: ${control.request.leverage}x${margin}`
}

function controlStatusClass(lifecycle: string): string {
  if (lifecycle === 'succeeded') return 'text-[var(--color-success)]'
  if (lifecycle === 'applying') return 'text-warning'
  return 'text-error'
}

onMounted(() => {
  if (!accounts.lastFetchedAt) {
    accounts.fetchAccounts().catch((err) => {
      logger.error('initial fetch failed', err)
    })
  }
  accounts.accounts.forEach(ensureLeverageForm)
})

watch(
  () => accounts.accounts.map((account) => account.id).join('|'),
  () => {
    accounts.accounts.forEach(ensureLeverageForm)
  },
)
</script>

<template>
  <section class="panel-card flex h-full flex-col">
    <div v-if="props.mode !== 'detail'" class="panel-header-row">
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

      <p
        v-else-if="props.mode === 'detail' && sortedAccounts.length === 0"
        class="text-center text-xs text-error"
      >
        This trading account is no longer available.
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
          <div class="flex flex-1 items-start justify-between gap-3 px-3 py-2">
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
                </span>
                <span
                  v-if="accountMetadataStatus(account)"
                  class="text-[11px]"
                  :class="accountStatusClass(account)"
                >
                  {{ accountMetadataStatus(account) }}
                </span>
              </button>

              <div
                v-if="showAccountDetails(account)"
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
                          : 'BTCUSDT'
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
                  class="btn btn-secondary btn-xs self-end"
                  type="button"
                  :disabled="!canSetHedgeMode(account)"
                  @click="enableHedgeMode(account)"
                >
                  Enable Hedge
                </button>
              </div>
              <div
                v-if="showAccountDetails(account) && projectedAccountControls(account).length > 0"
                class="grid gap-1 border-t border-[var(--panel-border-inner)] pt-2 text-[11px]"
              >
                <div
                  v-for="control in projectedAccountControls(account)"
                  :key="control.control_id"
                  class="flex items-start justify-between gap-3"
                >
                  <span class="font-mono text-primary">{{ controlLabel(control) }}</span>
                  <span class="text-right" :class="controlStatusClass(control.lifecycle)">
                    {{ control.lifecycle }}
                    <span v-if="control.last_reason" class="block max-w-[42rem] normal-case">
                      {{ control.last_reason }}
                    </span>
                  </span>
                </div>
              </div>
              <p
                v-if="showAccountDetails(account) && account.exchange === ExchangeType.Hyperliquid"
                class="m-0 text-[11px] leading-relaxed text-[var(--color-text-dim)]"
              >
                Wallet:
                <span class="break-all font-mono text-primary">
                  {{ account.exchange_metadata?.user_address || 'missing' }}
                </span>
                <br />
                Trading target:
                <span class="break-all font-mono text-primary">
                  {{ hyperliquidTradingTarget(account) }}
                </span>
                <span v-if="account.exchange_metadata?.vault_address"> (vault/subaccount)</span>
                <span v-else> (main account)</span>
                <br />
                Hyperliquid leverage is one-way per-symbol exchange state. Save prefs records the
                account default, margin mode, and symbol overrides in Trad; Set Leverage applies the
                current leverage and margin mode to the exchange for the symbols entered above.
              </p>
              <div
                v-if="showAccountDetails(account) && account.exchange === ExchangeType.Hyperliquid"
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
                v-if="showAccountDetails(account) && account.exchange === ExchangeType.Bybit"
                class="m-0 text-[11px] leading-relaxed text-[var(--color-text-dim)]"
              >
                Bybit leverage is persistent per-symbol exchange state. Attached TP/SL is
                exchange-managed after acceptance, but fills remain subject to liquidity, gaps, and
                liquidation risk. Applied leverage commands and their exchange-confirmed lifecycle
                are shown above.
              </p>
              <div
                v-if="showAccountDetails(account) && account.exchange === ExchangeType.Hyperliquid"
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
                <p
                  v-if="agentApprovalFeedback[account.id]"
                  class="m-0 break-words text-[11px] leading-relaxed normal-case tracking-normal md:col-span-3"
                  :class="approvalFeedbackClass(agentApprovalFeedback[account.id]!)"
                  role="status"
                  aria-live="polite"
                >
                  {{ agentApprovalFeedback[account.id]!.message }}
                </p>
              </div>
              <div
                v-if="showAccountDetails(account) && account.exchange === ExchangeType.Hyperliquid"
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
                  <span>Target total / side</span>
                  <input
                    v-if="account.exchange_metadata?.builder_fee_manager === true"
                    v-model.trim="builderForms[account.id].targetTotalBps"
                    class="input h-7 text-xs"
                    type="number"
                    min="0"
                    :max="HYPERLIQUID_TARGET_TOTAL_MAX_TENTHS_BPS / 10"
                    step="0.1"
                    @focus="ensureBuilderForm(account)"
                  />
                  <span v-else class="input flex h-7 items-center text-xs">
                    {{
                      (hyperliquidTargetTotalTenthsBps(account.exchange_metadata) / 10).toFixed(1)
                    }}
                    bps
                  </span>
                  <span class="normal-case tracking-normal text-[var(--color-text-dim)]">
                    {{ targetTotalEquivalent(account) }}
                  </span>
                </label>
                <button
                  v-if="account.exchange_metadata?.builder_fee_manager === true"
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
                  Exchange fee + Trad builder fee equals the target total. The builder fee is
                  calculated from the live account fee tier for each submitted order.
                  <br />
                  Approved max:
                  <span class="font-mono text-primary">
                    {{ approvedBuilderMaxLabel(account) }}
                  </span>
                  · Status:
                  <span class="font-mono text-primary">
                    {{ account.exchange_metadata?.builder_approved ? 'approved' : 'unvalidated' }}
                  </span>
                </p>
                <p
                  v-if="builderApprovalFeedback[account.id]"
                  class="m-0 break-words text-[11px] leading-relaxed normal-case tracking-normal md:col-span-5"
                  :class="approvalFeedbackClass(builderApprovalFeedback[account.id]!)"
                  role="status"
                  aria-live="polite"
                >
                  {{ builderApprovalFeedback[account.id]!.message }}
                </p>
              </div>
            </div>

            <button
              v-if="props.mode === 'compact'"
              class="btn btn-xs"
              :class="accountReady(account) ? 'btn-secondary' : 'btn-primary'"
              type="button"
              @click.stop="manageAccount(account)"
            >
              {{ accountReady(account) ? 'Manage' : 'Setup' }}
            </button>
            <button
              class="btn icon-btn btn-sm"
              type="button"
              title="Delete flat account"
              :disabled="deletingAccountIds.has(account.id)"
              @click="requestAccountDeletion(account)"
            >
              <X :size="12" />
            </button>
          </div>
        </li>
      </ul>
    </div>
    <CreateAccountModal :open="isCreateModalOpen" @close="isCreateModalOpen = false" />
    <ActionConfirmationModal
      :open="deletionTarget !== null"
      title="Delete trading account"
      :message="
        deletionTarget
          ? `Delete ${deletionTarget.label}? Trad will first reconcile the exchange and will refuse deletion if any position, order, protection, unresolved execution, or pending exchange action remains. Encrypted credentials are erased only after those checks pass.`
          : ''
      "
      confirm-label="Check and delete"
      @cancel="deletionTarget = null"
      @confirm="confirmAccountDeletion"
    />
  </section>
</template>
