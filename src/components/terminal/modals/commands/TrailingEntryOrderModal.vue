<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import {
  type SplitMode,
  type TrailingEntryOrderCommand,
  type UserCommandPayload,
  type SplitPreviewCommand,
  PositionSide,
} from '@/lib/ws/protocol'
import { useAccountsStore } from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'
import { useSplitPreviewStore } from '@/stores/splitPreview'
import { useWsStore } from '@/stores/ws'

import type { TrailingEntryPrefill } from './types'
import { createLogger } from '@/lib/utils'

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
const risk_amount = ref<number | null>(null)
const position_side = ref<PositionSide>(PositionSide.Long)
const split_target_notional = ref<number | null>(null)
const split_max_splits_cap = ref<number | null>(null)
const split_mode = ref<SplitMode | ''>('')
const split_slippage_margin = ref<number | null>(null)
const previewRequestId = ref<string | null>(null)
let previewTimer: number | null = null

const preview = computed(() => {
  if (!previewRequestId.value) return null
  return splitPreviewStore.getPreview(previewRequestId.value)
})

function applyInitialValues() {
  const preset = (modals.modalValues['TrailingEntryOrder'] as TrailingEntryPrefill) ?? {}
  selectedAccountId.value = accounts.selectedAccount?.id ?? ''
  activation_price.value = preset.activation_price ?? null
  jump_frac_threshold.value = preset.jump_frac_threshold ?? null
  position_side.value = preset.position_side ?? PositionSide.Long
  risk_amount.value = preset.risk_amount ?? null
  stop_loss.value = preset.stop_loss ?? null
  symbol.value = preset.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  split_target_notional.value = null
  split_max_splits_cap.value = null
  split_mode.value = ''
  split_slippage_margin.value = null
  lastAccountId.value = selectedAccountId.value
}

watch(
  () => props.open,
  (o) => {
    if (o) applyInitialValues()
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
})

function validate(): boolean {
  if (!selectedAccountId.value) return false
  if (!symbol.value) return false
  if (activation_price.value === null) return false
  if (jump_frac_threshold.value === null) return false
  if (stop_loss.value === null) return false
  if (risk_amount.value === null) return false
  return true
}

function submit() {
  const marketContext = accounts.getMarketContextForAccount(selectedAccountId.value)
  if (!marketContext) {
    logger.error('No market context found for account', selectedAccountId.value)
    return
  }
  if (!validate()) {
    logger.error('Validation failed')
    return
  }
  const data: TrailingEntryOrderCommand = {
    activation_price: activation_price.value as number,
    jump_frac_threshold: jump_frac_threshold.value as number,
    market_context: marketContext,
    position_side: position_side.value,
    risk_amount: risk_amount.value as number,
    stop_loss: stop_loss.value as number,
    symbol: symbol.value,
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
  if (!symbol.value) return false
  if (activation_price.value === null) return false
  if (stop_loss.value === null) return false
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
    symbol: symbol.value,
    market_context: marketContext,
    position_side: position_side.value,
    activation_price: activation_price.value as number,
    stop_loss: stop_loss.value as number,
    risk_amount: risk_amount.value as number,
    split_settings: Object.values(split_settings).some((v) => v !== undefined)
      ? split_settings
      : undefined,
  }
  const payload: UserCommandPayload = { kind: 'SplitPreview', data }
  previewRequestId.value = ws.sendUserCommandPreview(payload)
}

watch(
  [
    selectedAccountId,
    symbol,
    activation_price,
    stop_loss,
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
    previewTimer = window.setTimeout(() => {
      requestPreview()
    }, 300)
  },
)

function formatNumber(value: number, digits: number) {
  return value.toFixed(digits)
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
              {{ account.label }} ({{ account.exchange }} - {{ account.network }})
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
          <input type="number" v-model.number="activation_price" />
        </label>
        <label class="field">
          <span>Jump Threshold (%)</span>
          <input type="number" step="0.0001" v-model.number="jump_frac_threshold" />
        </label>
        <label class="field">
          <span>Stop Loss</span><input type="number" v-model.number="stop_loss" />
        </label>
        <label class="field">
          <span>Risk Amount</span><input type="number" v-model.number="risk_amount" />
        </label>
      </div>

      <div class="space-y-2">
        <div class="section-title">Splits</div>
        <div class="grid gap-3 md:grid-cols-2">
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
        <div v-if="preview" class="preview">
          <div class="preview-row">
            <span>Estimated splits</span>
            <span class="preview-value">
              {{ preview.split_count }} (range {{ preview.split_min }}–{{ preview.split_max }})
            </span>
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
        </div>
      </div>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button form="trailing-entry" type="submit" class="btn btn-primary">Submit</button>
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
.preview {
  border: 1px solid var(--border-color);
  border-radius: 6px;
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
</style>
