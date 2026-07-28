<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, Info, Settings2 } from 'lucide-vue-next'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  ExchangeType,
  MarketAction,
  NetworkType,
  type HyperliquidPositionEffectPreviewRequest,
  type MarketContext,
  type SplitMode,
  type TrailingEntryOrderCommand,
  type UserCommandPayload,
  type SplitPreviewCommand,
  PositionSide,
} from '@/lib/ws/protocol'
import {
  accountMetadataChips,
  isBybitMetadataVerified,
  isHyperliquidMetadataReady,
  useAccountsStore,
} from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'
import { useSplitPreviewStore } from '@/stores/splitPreview'
import { useWsStore } from '@/stores/ws'

import type { TrailingEntryPrefill } from './types'
import HyperliquidPositionEffectPreview from './HyperliquidPositionEffectPreview.vue'
import { useHyperliquidPositionEffectPreview } from '@/composables/useHyperliquidPositionEffectPreview'
import { createLogger } from '@/lib/utils'
import { formatNumberShort } from '@/lib/numberFormat'
import {
  trailingEntryExitLevelError,
  isValidHyperliquidPerpSymbol,
  isValidBybitUsdtSymbol,
  normalizeHyperliquidPerpSymbol,
  normalizeBybitUsdtSymbol,
} from '@/lib/bybitOrderValidation'

const logger = createLogger('commands')

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })

const emit = defineEmits<{
  (e: 'submit', payload: Extract<UserCommandPayload, { kind: 'TrailingEntryOrder' }>): void
  (e: 'close'): void
}>()

const accounts = useAccountsStore()
const modals = useModalStore()
const ws = useWsStore()
const splitPreviewStore = useSplitPreviewStore()

const selectedAccountId = ref<string>('')
const symbol = ref<string>('BTCUSDT')
const lastAccountId = ref<string>('')
const activation_price = ref<number | null>(null)
const jump_frac_threshold = ref<number | null>(null)
const stop_loss = ref<number | null>(null)
const take_profit = ref<number | null | ''>(null)
const risk_amount = ref<number | null>(null)
const position_side = ref<PositionSide>(PositionSide.Long)
const showHyperliquidPositionInfo = ref(false)
const showHyperliquidSplitControls = ref(false)
const split_target_notional = ref<number | null>(null)
const split_max_splits_cap = ref<number | null>(null)
const split_mode = ref<SplitMode | ''>('')
const split_slippage_margin = ref<number | null>(null)
const previewRequestId = ref<string | null>(null)
const bybitTickerPrice = ref<number | null>(null)
const bybitTickerFetchedAt = ref<number | null>(null)
const bybitTickerNow = ref(Date.now())
const bybitTickerError = ref<string | null>(null)
const bybitTickerLoading = ref(false)
const hyperliquidTickerPrice = ref<number | null>(null)
const hyperliquidTickerFetchedAt = ref<number | null>(null)
const hyperliquidTickerNow = ref(Date.now())
const hyperliquidTickerError = ref<string | null>(null)
const hyperliquidTickerLoading = ref(false)
let previewTimer: number | null = null
let bybitTickerTimer: number | null = null
let bybitTickerClockTimer: number | null = null
let bybitTickerAbort: AbortController | null = null
let bybitTickerRequestSeq = 0
let hyperliquidTickerTimer: number | null = null
let hyperliquidTickerClockTimer: number | null = null
let hyperliquidTickerAbort: AbortController | null = null
let hyperliquidTickerRequestSeq = 0

const BYBIT_TICKER_POLL_MS = 5000
const HYPERLIQUID_TICKER_POLL_MS = 5000

const preview = computed(() => {
  if (!previewRequestId.value) return null
  return splitPreviewStore.getPreview(previewRequestId.value)
})
const previewError = computed(() => {
  if (!previewRequestId.value) return null
  return splitPreviewStore.getError(previewRequestId.value)
})
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const isBybitAccount = computed(() => selectedAccount.value?.exchange === ExchangeType.Bybit)
const isHyperliquidAccount = computed(
  () => selectedAccount.value?.exchange === ExchangeType.Hyperliquid,
)
const bybitTickerSymbol = computed(() => {
  if (!props.open || !isBybitAccount.value) return null
  if (!isValidBybitUsdtSymbol(symbol.value)) return null
  return normalizeBybitUsdtSymbol(symbol.value)
})
const hyperliquidTickerSymbol = computed(() => {
  if (!props.open || !isHyperliquidAccount.value) return null
  if (!isValidHyperliquidPerpSymbol(symbol.value)) return null
  return normalizeHyperliquidPerpSymbol(symbol.value)
})
const blocksOpeningOrder = computed(() => {
  if (isBybitAccount.value) return !isBybitMetadataVerified(selectedAccount.value)
  if (isHyperliquidAccount.value) return !isHyperliquidMetadataReady(selectedAccount.value)
  return false
})
const requiresSuccessfulPreview = computed(
  () => (isBybitAccount.value || isHyperliquidAccount.value) && canPreview(),
)
const selectedMarketContext = computed<MarketContext | null>(() =>
  accounts.getMarketContextForAccount(selectedAccountId.value),
)
const selectedCapabilities = computed(() =>
  ws.capabilitiesForMarketContext(selectedMarketContext.value),
)
const teCapabilityBlocked = computed(
  () => selectedCapabilities.value !== null && !selectedCapabilities.value.supports_trailing_entry,
)
const supportsTeTakeProfit = computed(() => {
  const capabilities = selectedCapabilities.value
  if (capabilities) {
    return (
      capabilities.supports_trailing_entry && capabilities.supports_attached_take_profit_stop_loss
    )
  }
  return false
})
const exitLevelError = computed(() => {
  if (!isBybitAccount.value && !isHyperliquidAccount.value) return null
  return trailingEntryExitLevelError(
    isHyperliquidAccount.value ? 'Hyperliquid' : 'Bybit',
    position_side.value,
    activation_price.value,
    stop_loss.value,
    supportsTeTakeProfit.value ? take_profit.value : null,
  )
})
const hasValidActivationPrice = computed(() => isPositiveFiniteNumber(activation_price.value))
const jumpActivationMove = computed(() => {
  if (
    !isPositiveFiniteNumber(activation_price.value) ||
    !isNonNegativeFiniteNumber(jump_frac_threshold.value)
  ) {
    return null
  }
  return (activation_price.value * jump_frac_threshold.value) / 100
})
const jumpBoundLabel = computed(() => {
  const amount = jumpActivationMove.value
  if (amount === null) return null
  const formatted = formatNumber(amount, 2)
  if (position_side.value === PositionSide.Long) {
    return `Activation estimate: $${formatted} max jump; live move shrinks as the low improves.`
  }
  return `Activation estimate: $${formatted} min jump; live move grows as the high improves.`
})
const bybitTickerAgeSeconds = computed(() => {
  if (!bybitTickerFetchedAt.value) return null
  return Math.max(0, Math.round((bybitTickerNow.value - bybitTickerFetchedAt.value) / 1000))
})
const bybitTickerStatusLabel = computed(() => {
  if (!isBybitAccount.value) return null
  if (!bybitTickerSymbol.value) return 'Enter a valid Bybit USDT symbol'
  if (bybitTickerError.value) return 'Price unavailable'
  if (bybitTickerPrice.value !== null) return 'Bybit public last'
  if (bybitTickerLoading.value) return 'Loading Bybit price'
  return 'Bybit public last'
})
const hyperliquidTickerAgeSeconds = computed(() => {
  if (!hyperliquidTickerFetchedAt.value) return null
  return Math.max(
    0,
    Math.round((hyperliquidTickerNow.value - hyperliquidTickerFetchedAt.value) / 1000),
  )
})
const hyperliquidTickerStatusLabel = computed(() => {
  if (!isHyperliquidAccount.value) return null
  if (!hyperliquidTickerSymbol.value) return 'Enter a valid Hyperliquid symbol'
  if (hyperliquidTickerError.value) return 'Price unavailable'
  if (hyperliquidTickerPrice.value !== null) return 'Hyperliquid public mid'
  if (hyperliquidTickerLoading.value) return 'Loading Hyperliquid price'
  return 'Hyperliquid public mid'
})
const readinessLabel = computed(() =>
  isHyperliquidAccount.value ? 'Hyperliquid setup' : 'Bybit metadata',
)
const readinessWarning = computed(() =>
  isHyperliquidAccount.value
    ? 'Complete Hyperliquid wallet/agent setup and builder approval before opening live orders.'
    : 'Refresh credentials before opening live Bybit orders.',
)
const positionEffectRequest = computed<HyperliquidPositionEffectPreviewRequest | null>(() => {
  const marketContext = selectedMarketContext.value
  if (
    !marketContext ||
    !isHyperliquidAccount.value ||
    !preview.value ||
    preview.value.total_qty_adj <= 0
  ) {
    return null
  }
  return {
    market_context: marketContext,
    symbol: normalizeHyperliquidPerpSymbol(symbol.value),
    action: MarketAction.Open,
    position_side: position_side.value,
    quantity: preview.value.total_qty_adj,
    quantity_mode: 'base',
    reference_price: preview.value.price_est,
    one_way_open_semantics: 'target_side_exposure',
  }
})
const positionEffect = useHyperliquidPositionEffectPreview(
  positionEffectRequest,
  computed(() => props.open && isHyperliquidAccount.value),
)

function requestSelectedCapabilities() {
  if (selectedMarketContext.value) {
    ws.requestMarketCapabilities(selectedMarketContext.value)
  }
}

function applyInitialValues() {
  const preset = (modals.modalValues['TrailingEntryOrder'] as TrailingEntryPrefill) ?? {}
  selectedAccountId.value = accounts.selectedAccount?.id ?? ''
  activation_price.value = preset.activation_price ?? null
  jump_frac_threshold.value = preset.jump_frac_threshold ?? null
  position_side.value = preset.position_side ?? PositionSide.Long
  risk_amount.value = preset.risk_amount ?? null
  stop_loss.value = preset.stop_loss ?? null
  take_profit.value = preset.take_profit ?? null
  symbol.value = preset.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  split_target_notional.value = null
  split_max_splits_cap.value = null
  split_mode.value = ''
  split_slippage_margin.value = null
  showHyperliquidPositionInfo.value = false
  showHyperliquidSplitControls.value = false
  lastAccountId.value = selectedAccountId.value
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

watch(
  () => props.open,
  (o) => {
    if (o) applyInitialValues()
    if (o) requestSelectedCapabilities()
  },
)

applyInitialValues()

watch(selectedAccountId, (next, prev) => {
  const prevDefault = accounts.getDefaultSymbolForAccount(prev || lastAccountId.value)
  const nextDefault = accounts.getDefaultSymbolForAccount(next)
  if (!symbol.value || symbol.value === prevDefault) {
    symbol.value = nextDefault
  }
  lastAccountId.value = next
  requestSelectedCapabilities()
})

watch(supportsTeTakeProfit, (supported) => {
  if (selectedCapabilities.value && !supported) {
    take_profit.value = null
  }
})

function validate(): boolean {
  if (!selectedAccountId.value) return false
  if (teCapabilityBlocked.value) return false
  if (blocksOpeningOrder.value) return false
  if (!symbol.value.trim()) return false
  if (isBybitAccount.value && !isValidBybitUsdtSymbol(symbol.value)) return false
  if (isHyperliquidAccount.value && !isValidHyperliquidPerpSymbol(symbol.value)) return false
  if (exitLevelError.value) return false
  if (previewError.value) return false
  if (requiresSuccessfulPreview.value && !preview.value) return false
  if (activation_price.value === null) return false
  if (jump_frac_threshold.value === null) return false
  if (stop_loss.value === null) return false
  if (
    take_profit.value !== null &&
    take_profit.value !== '' &&
    optionalPositivePrice(take_profit.value) === null
  ) {
    return false
  }
  if (risk_amount.value === null) return false
  return true
}

function optionalPositivePrice(value: number | null | ''): number | null {
  if (value === null || value === '') return null
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

function submit() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext) {
    logger.error('No market context found for account', selectedAccountId.value)
    return
  }
  if (!validate() || !positionEffect.canSubmit.value) {
    logger.error('Validation failed')
    return
  }
  const normalizedTakeProfit = supportsTeTakeProfit.value
    ? optionalPositivePrice(take_profit.value)
    : null
  const data: TrailingEntryOrderCommand = {
    activation_price: activation_price.value as number,
    jump_frac_threshold: jump_frac_threshold.value as number,
    market_context: marketContext,
    position_side: position_side.value,
    risk_amount: risk_amount.value as number,
    stop_loss: stop_loss.value as number,
    take_profit: normalizedTakeProfit,
    symbol: normalizedSymbolForSubmit(),
  }
  const split_settings = {
    target_child_notional: split_target_notional.value ?? undefined,
    max_splits_cap: split_max_splits_cap.value ?? undefined,
    mode: split_mode.value || undefined,
    slippage_margin:
      split_slippage_margin.value !== null ? split_slippage_margin.value / 100 : undefined,
  }
  if (Object.values(split_settings).some((value) => value !== undefined)) {
    data.split_settings = split_settings
  }
  const payload: Extract<UserCommandPayload, { kind: 'TrailingEntryOrder' }> = {
    kind: 'TrailingEntryOrder',
    data,
  }
  emit('submit', payload)
}

function canPreview(): boolean {
  if (!selectedAccountId.value) return false
  if (!symbol.value.trim()) return false
  if (isBybitAccount.value && !isValidBybitUsdtSymbol(symbol.value)) return false
  if (isHyperliquidAccount.value && !isValidHyperliquidPerpSymbol(symbol.value)) return false
  if (activation_price.value === null) return false
  if (stop_loss.value === null) return false
  if (exitLevelError.value) return false
  if (risk_amount.value === null) return false
  return true
}

function requestPreview() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext) return
  if (!canPreview()) return

  const split_settings = {
    target_child_notional: split_target_notional.value ?? undefined,
    max_splits_cap: split_max_splits_cap.value ?? undefined,
    mode: split_mode.value || undefined,
    slippage_margin:
      split_slippage_margin.value !== null ? split_slippage_margin.value / 100 : undefined,
  }

  const data: SplitPreviewCommand = {
    symbol: normalizedSymbolForSubmit(),
    market_context: marketContext,
    position_side: position_side.value,
    activation_price: activation_price.value as number,
    stop_loss: stop_loss.value as number,
    take_profit: supportsTeTakeProfit.value ? optionalPositivePrice(take_profit.value) : null,
    risk_amount: risk_amount.value as number,
    split_settings: Object.values(split_settings).some((v) => v !== undefined)
      ? split_settings
      : undefined,
  }
  const payload: UserCommandPayload = { kind: 'SplitPreview', data }
  previewRequestId.value = ws.sendUserCommandPreview(payload)
  splitPreviewStore.clearPreview(previewRequestId.value)
}

function resetBybitTickerState() {
  bybitTickerPrice.value = null
  bybitTickerFetchedAt.value = null
  bybitTickerError.value = null
  bybitTickerLoading.value = false
}

function resetHyperliquidTickerState() {
  hyperliquidTickerPrice.value = null
  hyperliquidTickerFetchedAt.value = null
  hyperliquidTickerError.value = null
  hyperliquidTickerLoading.value = false
}

function normalizedSymbolForSubmit(): string {
  if (isBybitAccount.value) return normalizeBybitUsdtSymbol(symbol.value)
  if (isHyperliquidAccount.value) return normalizeHyperliquidPerpSymbol(symbol.value)
  return symbol.value
}

function stopBybitTickerPoll(reset = false) {
  if (bybitTickerTimer !== null) {
    window.clearTimeout(bybitTickerTimer)
    bybitTickerTimer = null
  }
  if (bybitTickerClockTimer !== null) {
    window.clearInterval(bybitTickerClockTimer)
    bybitTickerClockTimer = null
  }
  if (bybitTickerAbort) {
    bybitTickerAbort.abort()
    bybitTickerAbort = null
  }
  bybitTickerRequestSeq += 1
  if (reset) {
    resetBybitTickerState()
  }
}

async function fetchBybitTicker(symbolToFetch: string, seq: number) {
  bybitTickerAbort?.abort()
  const controller = new AbortController()
  bybitTickerAbort = controller
  bybitTickerLoading.value = true

  try {
    const params = new URLSearchParams({ category: 'linear', symbol: symbolToFetch })
    const response = await fetch(`https://api.bybit.com/v5/market/tickers?${params}`, {
      method: 'GET',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const body = (await response.json()) as {
      retCode?: number
      retMsg?: string
      result?: { list?: Array<{ lastPrice?: string; markPrice?: string; symbol?: string }> }
    }
    if (body.retCode !== 0) {
      throw new Error(body.retMsg || `retCode ${body.retCode}`)
    }
    const row = body.result?.list?.[0]
    const rawPrice = row?.lastPrice ?? row?.markPrice
    const price = rawPrice ? Number(rawPrice) : NaN
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('missing last price')
    }
    if (seq !== bybitTickerRequestSeq) return
    bybitTickerPrice.value = price
    bybitTickerFetchedAt.value = Date.now()
    bybitTickerError.value = null
  } catch (err) {
    if (controller.signal.aborted || seq !== bybitTickerRequestSeq) return
    bybitTickerPrice.value = null
    bybitTickerFetchedAt.value = null
    bybitTickerError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === bybitTickerRequestSeq) {
      bybitTickerLoading.value = false
      bybitTickerAbort = null
    }
  }
}

function scheduleBybitTickerPoll(symbolToFetch: string, seq: number) {
  if (bybitTickerTimer !== null) {
    window.clearTimeout(bybitTickerTimer)
  }
  bybitTickerTimer = window.setTimeout(async () => {
    if (seq !== bybitTickerRequestSeq || bybitTickerSymbol.value !== symbolToFetch) return
    await fetchBybitTicker(symbolToFetch, seq)
    if (seq === bybitTickerRequestSeq && bybitTickerSymbol.value === symbolToFetch) {
      scheduleBybitTickerPoll(symbolToFetch, seq)
    }
  }, BYBIT_TICKER_POLL_MS)
}

function startBybitTickerPoll(symbolToFetch: string) {
  stopBybitTickerPoll(true)
  const seq = bybitTickerRequestSeq
  bybitTickerNow.value = Date.now()
  bybitTickerClockTimer = window.setInterval(() => {
    bybitTickerNow.value = Date.now()
  }, 1000)
  void fetchBybitTicker(symbolToFetch, seq).then(() => {
    if (seq === bybitTickerRequestSeq && bybitTickerSymbol.value === symbolToFetch) {
      scheduleBybitTickerPoll(symbolToFetch, seq)
    }
  })
}

function stopHyperliquidTickerPoll(reset = false) {
  if (hyperliquidTickerTimer !== null) {
    window.clearTimeout(hyperliquidTickerTimer)
    hyperliquidTickerTimer = null
  }
  if (hyperliquidTickerClockTimer !== null) {
    window.clearInterval(hyperliquidTickerClockTimer)
    hyperliquidTickerClockTimer = null
  }
  if (hyperliquidTickerAbort) {
    hyperliquidTickerAbort.abort()
    hyperliquidTickerAbort = null
  }
  hyperliquidTickerRequestSeq += 1
  if (reset) {
    resetHyperliquidTickerState()
  }
}

function hyperliquidInfoEndpoint(): string {
  return selectedAccount.value?.network === NetworkType.Testnet
    ? 'https://api.hyperliquid-testnet.xyz/info'
    : 'https://api.hyperliquid.xyz/info'
}

async function fetchHyperliquidTicker(symbolToFetch: string, seq: number) {
  hyperliquidTickerAbort?.abort()
  const controller = new AbortController()
  hyperliquidTickerAbort = controller
  hyperliquidTickerLoading.value = true

  try {
    const response = await fetch(hyperliquidInfoEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const body = (await response.json()) as Record<string, string | number | undefined>
    const rawPrice = body[symbolToFetch]
    const price = rawPrice !== undefined ? Number(rawPrice) : NaN
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('missing mid price')
    }
    if (seq !== hyperliquidTickerRequestSeq) return
    hyperliquidTickerPrice.value = price
    hyperliquidTickerFetchedAt.value = Date.now()
    hyperliquidTickerError.value = null
  } catch (err) {
    if (controller.signal.aborted || seq !== hyperliquidTickerRequestSeq) return
    hyperliquidTickerPrice.value = null
    hyperliquidTickerFetchedAt.value = null
    hyperliquidTickerError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (seq === hyperliquidTickerRequestSeq) {
      hyperliquidTickerLoading.value = false
      hyperliquidTickerAbort = null
    }
  }
}

function scheduleHyperliquidTickerPoll(symbolToFetch: string, seq: number) {
  if (hyperliquidTickerTimer !== null) {
    window.clearTimeout(hyperliquidTickerTimer)
  }
  hyperliquidTickerTimer = window.setTimeout(async () => {
    if (seq !== hyperliquidTickerRequestSeq || hyperliquidTickerSymbol.value !== symbolToFetch) {
      return
    }
    await fetchHyperliquidTicker(symbolToFetch, seq)
    if (seq === hyperliquidTickerRequestSeq && hyperliquidTickerSymbol.value === symbolToFetch) {
      scheduleHyperliquidTickerPoll(symbolToFetch, seq)
    }
  }, HYPERLIQUID_TICKER_POLL_MS)
}

function startHyperliquidTickerPoll(symbolToFetch: string) {
  stopHyperliquidTickerPoll(true)
  const seq = hyperliquidTickerRequestSeq
  hyperliquidTickerNow.value = Date.now()
  hyperliquidTickerClockTimer = window.setInterval(() => {
    hyperliquidTickerNow.value = Date.now()
  }, 1000)
  void fetchHyperliquidTicker(symbolToFetch, seq).then(() => {
    if (seq === hyperliquidTickerRequestSeq && hyperliquidTickerSymbol.value === symbolToFetch) {
      scheduleHyperliquidTickerPoll(symbolToFetch, seq)
    }
  })
}

watch(
  [
    selectedAccountId,
    symbol,
    activation_price,
    stop_loss,
    take_profit,
    risk_amount,
    position_side,
    split_target_notional,
    split_max_splits_cap,
    split_mode,
    split_slippage_margin,
    () => props.open,
  ],
  () => {
    if (!props.open) return
    if (previewTimer) window.clearTimeout(previewTimer)
    previewRequestId.value = null
    previewTimer = window.setTimeout(() => {
      requestPreview()
    }, 300)
  },
)

watch(
  bybitTickerSymbol,
  (next) => {
    if (!next) {
      stopBybitTickerPoll(true)
      return
    }
    startBybitTickerPoll(next)
  },
  { immediate: true },
)

watch(
  hyperliquidTickerSymbol,
  (next) => {
    if (!next) {
      stopHyperliquidTickerPoll(true)
      return
    }
    startHyperliquidTickerPoll(next)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopBybitTickerPoll()
  stopHyperliquidTickerPoll()
  if (previewTimer) {
    window.clearTimeout(previewTimer)
    previewTimer = null
  }
})

function formatNumber(value: number, digits: number) {
  return formatNumberShort(value, { minDecimals: digits, maxDecimals: 6 })
}
</script>
<template>
  <BaseCommandModal title="Trailing Entry" :open="open" @close="emit('close')">
    <form id="trailing-entry" class="space-y-4" @submit.prevent="submit">
      <div class="grid gap-3 md:grid-cols-2">
        <label class="field">
          <span>Account</span>
          <select v-model="selectedAccountId" class="input">
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.label }} ({{ accountMetadataChips(account).join(' / ') }})
            </option>
          </select>
        </label>
        <label class="field">
          <span>Symbol</span>
          <input type="text" v-model="symbol" />
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="position_side">
            <option>Long</option>
            <option>Short</option>
          </select>
        </label>
        <label class="field">
          <span>Activation Price</span>
          <input type="number" step="any" v-model.number="activation_price" />
          <small v-if="isBybitAccount" class="form-hint">
            <template v-if="bybitTickerPrice !== null">
              Bybit public last ${{ formatNumber(bybitTickerPrice, 2) }} ·
              {{ bybitTickerAgeSeconds }}s ago
            </template>
            <template v-else-if="bybitTickerLoading">Bybit public last loading</template>
            <template v-else-if="bybitTickerError">Bybit public last unavailable</template>
            <template v-else>{{ bybitTickerStatusLabel }}</template>
          </small>
          <small v-else-if="isHyperliquidAccount" class="form-hint">
            <template v-if="hyperliquidTickerPrice !== null">
              Hyperliquid public mid ${{ formatNumber(hyperliquidTickerPrice, 2) }} ·
              {{ hyperliquidTickerAgeSeconds }}s ago
            </template>
            <template v-else-if="hyperliquidTickerLoading">
              Hyperliquid public mid loading
            </template>
            <template v-else-if="hyperliquidTickerError">
              Hyperliquid public mid unavailable
            </template>
            <template v-else>{{ hyperliquidTickerStatusLabel }}</template>
          </small>
        </label>
        <label class="field">
          <span>Jump Threshold (%)</span>
          <input type="number" step="0.0001" v-model.number="jump_frac_threshold" />
          <small v-if="jumpBoundLabel" class="form-hint">{{ jumpBoundLabel }}</small>
          <small v-else-if="!hasValidActivationPrice" class="form-hint">
            Add activation price to estimate the starting jump distance.
          </small>
        </label>
        <label class="field">
          <span>Stop Loss Price</span><input type="number" step="any" v-model.number="stop_loss" />
        </label>
        <label v-if="supportsTeTakeProfit" class="field">
          <span>Take Profit Price</span>
          <input type="number" step="any" v-model.number="take_profit" />
        </label>
        <label class="field">
          <span>Risk Amount</span><input type="number" step="any" v-model.number="risk_amount" />
        </label>
      </div>

      <div v-if="isHyperliquidAccount" class="space-y-2">
        <button
          type="button"
          class="btn btn-ghost btn-sm inline-flex items-center gap-2"
          :aria-expanded="showHyperliquidPositionInfo"
          aria-controls="hyperliquid-te-position-info"
          title="Hyperliquid one-way position behavior"
          @click="showHyperliquidPositionInfo = !showHyperliquidPositionInfo"
        >
          <Info :size="14" aria-hidden="true" />
          <span>One-way position behavior</span>
        </button>
        <div
          v-if="showHyperliquidPositionInfo"
          id="hyperliquid-te-position-info"
          data-testid="hyperliquid-te-position-info"
          class="position-info"
        >
          <p>Hyperliquid maintains one net position per account and symbol.</p>
          <p>
            Existing same-side exposure remains unowned. This TE protects and closes only fills
            created by this command.
          </p>
          <p>
            If this TE triggers against opposite exposure, Trad first closes the entire opposite
            position, including exposure created outside Trad, confirms flat, and then opens the
            full {{ position_side.toLowerCase() }} target.
          </p>
          <p>Long and short exposure cannot remain open simultaneously on the same symbol.</p>
        </div>
      </div>

      <div class="space-y-2">
        <div class="section-heading">
          <div class="section-title">
            {{ isHyperliquidAccount ? 'Execution plan' : 'Splits' }}
          </div>
          <button
            v-if="isHyperliquidAccount"
            type="button"
            class="btn btn-ghost btn-sm inline-flex items-center gap-2"
            :aria-expanded="showHyperliquidSplitControls"
            aria-controls="hyperliquid-te-split-controls"
            @click="showHyperliquidSplitControls = !showHyperliquidSplitControls"
          >
            <Settings2 :size="14" aria-hidden="true" />
            <span>Advanced splits</span>
            <ChevronDown
              :size="14"
              aria-hidden="true"
              :class="{ 'rotate-180': showHyperliquidSplitControls }"
            />
          </button>
        </div>
        <div v-if="isHyperliquidAccount" class="preview-note">
          Defaults to one child. Trad adds children only when Hyperliquid's order maximum requires
          them.
        </div>
        <div
          v-if="!isHyperliquidAccount || showHyperliquidSplitControls"
          id="hyperliquid-te-split-controls"
          class="grid gap-3 md:grid-cols-2"
        >
          <label class="field">
            <span>Target Order Size (Notional)</span>
            <input
              type="number"
              step="0.01"
              v-model.number="split_target_notional"
              placeholder="Server default"
            />
          </label>
          <label class="field">
            <span>Max Splits Cap</span>
            <input type="number" step="1" v-model.number="split_max_splits_cap" />
          </label>
          <label class="field">
            <span>Split Mode</span>
            <select v-model="split_mode">
              <option value="">Server default</option>
              <option value="prefer_target">Prefer target size</option>
              <option value="max_splits">Max splits</option>
            </select>
          </label>
          <label class="field">
            <span>Slippage Margin (%)</span>
            <input
              type="number"
              step="0.01"
              v-model.number="split_slippage_margin"
              placeholder="0.5"
            />
          </label>
        </div>
        <div v-if="previewError" class="preview preview-error">
          <div class="preview-row">
            <span>Split preview rejected</span>
            <span class="preview-value">Blocked</span>
          </div>
          <div class="preview-warn">
            {{ previewError }}
          </div>
        </div>
        <div v-else-if="exitLevelError" class="preview preview-error">
          <div class="preview-row">
            <span>Exit levels</span>
            <span class="preview-value">Blocked</span>
          </div>
          <div class="preview-warn">
            {{ exitLevelError }}
          </div>
        </div>
        <div v-else-if="requiresSuccessfulPreview && !preview" class="preview">
          <div class="preview-row">
            <span>Split preview</span>
            <span class="preview-value">Pending</span>
          </div>
          <div class="preview-note">
            {{ isHyperliquidAccount ? 'Hyperliquid' : 'Bybit' }} entries require a successful split
            preview before submission.
          </div>
        </div>
        <div v-if="blocksOpeningOrder" class="preview preview-error">
          <div class="preview-row">
            <span>{{ readinessLabel }}</span>
            <span class="preview-value">Unvalidated</span>
          </div>
          <div class="preview-warn">{{ readinessWarning }}</div>
        </div>
        <div v-else-if="teCapabilityBlocked" class="preview preview-error">
          <div class="preview-row">
            <span>Trailing Entry</span>
            <span class="preview-value">Unavailable</span>
          </div>
          <div class="preview-warn">
            This server does not currently permit Hyperliquid Trailing Entry for the selected
            account.
          </div>
        </div>
        <div v-else-if="preview" class="preview">
          <div class="preview-row">
            <span>Estimated splits (current price)</span>
            <span class="preview-value">
              {{ preview.split_count }} (range {{ preview.split_min }}–{{ preview.split_max }})
            </span>
          </div>
          <div class="preview-row">
            <span>Target child notional</span>
            <span class="preview-value">${{ formatNumber(preview.target_child_notional, 2) }}</span>
          </div>
          <div class="preview-row">
            <span>Per‑order notional</span>
            <span class="preview-value">
              ${{ formatNumber(preview.child_notional_est, 2) }} (range ${{
                formatNumber(preview.child_notional_min, 2)
              }}–${{ formatNumber(preview.child_notional_max, 2) }})
            </span>
          </div>
          <div class="preview-row">
            <span>Price estimate</span>
            <span class="preview-value">
              ${{ formatNumber(preview.price_est, 2) }} ({{ preview.price_source }})
            </span>
          </div>
          <div v-if="preview.warnings.length" class="preview-warn">
            {{ preview.warnings.join(' ') }}
          </div>
          <div class="preview-note">Estimate uses current price; splits can change at trigger.</div>
        </div>
        <HyperliquidPositionEffectPreview
          v-if="isHyperliquidAccount"
          :preview="positionEffect.preview.value"
          :error="positionEffect.error.value"
          :pending="positionEffect.pending.value"
          :confirmed="positionEffect.confirmed.value"
          @update:confirmed="positionEffect.setConfirmed"
        />
      </div>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button
          form="trailing-entry"
          type="submit"
          class="btn btn-primary"
          :disabled="!validate() || !positionEffect.canSubmit.value"
        >
          Submit
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.section-title {
  color: var(--color-text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.rotate-180 {
  transform: rotate(180deg);
}
.preview {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 0.75rem;
  font-size: 12px;
  display: grid;
  gap: 6px;
}
.preview-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: var(--color-text-dim);
}
.preview-value {
  color: var(--color-text);
  font-family:
    ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}
.preview-warn {
  color: var(--color-danger);
  font-size: 11px;
}
.preview-error {
  border-color: color-mix(in srgb, var(--color-danger) 60%, var(--border-color));
}
.preview-note {
  color: var(--color-text-dim);
  font-size: 11px;
}
.position-info {
  border: 1px solid color-mix(in srgb, var(--color-warning) 60%, var(--border-color));
  padding: 0.75rem;
  color: var(--color-text);
  font-size: 11px;
  display: grid;
  gap: 0.5rem;
}
.position-info p {
  margin: 0;
}
</style>
