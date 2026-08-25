<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import MarketSymbolCombobox from '@/components/forms/MarketSymbolCombobox.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import type { PositionSideIntent, TimeInForceIntent } from '@/lib/gateway'
import {
  copyProtectionState,
  newEntryProtectionState,
  sizingModeFromPreference,
  sizingModePreference,
  type ProtectionFormState,
  type ShapeMode,
  type SizingMode,
} from '@/lib/engineCommands/form'
import { buildPlaceOrderIntent, previewIntent } from '@/lib/engineCommands/intents'
import { labelWithUnit, marketUnits } from '@/lib/engineCommands/marketUnits'
import type { OrderCommandPrefill } from '@/lib/engineCommands/prefill'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useModalStore } from '@/stores/modals'
import { useUiStore } from '@/stores/ui'
import ProtectionFields from './ProtectionFields.vue'
import ExecutionPreviewPanel from './ExecutionPreviewPanel.vue'
import LiveMarketPrice from './LiveMarketPrice.vue'
import ShapeFields from './ShapeFields.vue'
import SizingFields from './SizingFields.vue'
import FormField from '@/components/forms/FormField.vue'
import { decimalError, symbolError } from '@/lib/formValidation'

const props = defineProps<{ open: boolean; executionKind: 'market' | 'limit' }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const modals = useModalStore()
const ui = useUiStore()
const submission = useEngineCommandSubmission()
const selectedAccountId = ref('')
const symbol = ref('')
const positionSide = ref<PositionSideIntent>('long')
const sizingMode = ref<SizingMode>('quote_notional')
const amount = ref('50')
const limitPrice = ref('')
const timeInForce = ref<TimeInForceIntent>('good_til_canceled')
const shapeMode = ref<ShapeMode>('single')
const targetChildNotional = ref('')
const maxChildren = ref('20')
const protection = ref<ProtectionFormState>(newEntryProtectionState())
const validationError = ref<string | null>(null)
const catalogSymbolError = ref<string | null>(null)
const previewReady = ref(false)
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const markPriceOnly = computed(() => selectedAccount.value?.exchange === 'hyperliquid')
const units = computed(() => marketUnits(selectedAccount.value, symbol.value))
const accountError = computed(() =>
  selectedAccountId.value === '' ? 'Trading account is required' : null,
)
const orderSymbolError = computed(() => symbolError(symbol.value) || catalogSymbolError.value)
const limitPriceError = computed(() =>
  props.executionKind === 'limit' ? decimalError(limitPrice.value, 'limit price') : null,
)

const title = computed(() => (props.executionKind === 'market' ? 'Market Order' : 'Limit Order'))
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    selectedAccountId.value !== '' &&
    previewReady.value &&
    !submission.submitting.value,
)
const planningIntent = computed(() => {
  if (!props.open) return null
  try {
    return previewIntent(buildIntent())
  } catch {
    return null
  }
})

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

function reset(): void {
  const modalName = props.executionKind === 'market' ? 'EngineMarketOrder' : 'EngineLimitOrder'
  const prefill = modals.modalValues[modalName] as OrderCommandPrefill | undefined
  selectedAccountId.value =
    prefill?.accountId ?? accounts.selectedAccountId ?? accounts.accounts[0]?.id ?? ''
  symbol.value = prefill?.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  positionSide.value = prefill?.positionSide ?? 'long'
  sizingMode.value = prefill?.sizingMode ?? sizingModeFromPreference(ui.orderQuantityMode)
  amount.value = prefill?.amount ?? '50'
  limitPrice.value = prefill?.limitPrice ?? ''
  timeInForce.value = prefill?.timeInForce ?? 'good_til_canceled'
  shapeMode.value = prefill?.shapeMode ?? 'single'
  targetChildNotional.value = prefill?.targetChildNotional ?? ''
  maxChildren.value = prefill?.maxChildren ?? '20'
  protection.value = copyProtectionState(prefill ? prefill.protection : newEntryProtectionState())
  validationError.value = null
  previewReady.value = false
  submission.clearSubmissionError()
}

function applyAccountDefaultSymbol(): void {
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
}

function rememberSizingMode(mode: SizingMode): void {
  ui.setOrderQuantityMode(sizingModePreference(mode))
}

async function submit(): Promise<void> {
  validationError.value = null
  try {
    const intent = buildIntent()
    if (await submission.submit({ accountId: selectedAccountId.value, intent })) emit('close')
  } catch (error) {
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}

function buildIntent() {
  return buildPlaceOrderIntent({
    executionKind: props.executionKind,
    symbol: symbol.value,
    positionSide: positionSide.value,
    sizingMode: sizingMode.value,
    amount: amount.value,
    limitPrice: limitPrice.value,
    timeInForce: timeInForce.value,
    shapeMode: shapeMode.value,
    targetChildNotional: targetChildNotional.value,
    maxChildren: maxChildren.value,
    protection: protection.value,
  })
}
</script>

<template>
  <BaseCommandModal :title="title" :open="open" size="wide" @close="emit('close')">
    <form :id="`engine-${executionKind}-order`" class="command-form" @submit.prevent="submit">
      <div class="form-grid">
        <FormField
          label="Account"
          help="The configured exchange account that will own this order."
          :error="accountError"
          required
        >
          <select v-model="selectedAccountId" class="input" @change="applyAccountDefaultSymbol">
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.label }} · {{ account.exchange }} · {{ account.network }}
            </option>
          </select>
        </FormField>
        <FormField
          help="Exchange instrument symbol, such as BTC. Trad normalizes it to uppercase."
          :error="orderSymbolError"
          required
        >
          <template #label
            ><span class="symbol-heading">
              <span>Symbol</span>
              <LiveMarketPrice
                :active="open"
                :account-id="selectedAccountId"
                :symbol="symbol"
                :quote-asset="units.quote"
              /> </span
          ></template>
          <MarketSymbolCombobox
            v-model="symbol"
            :account="selectedAccount"
            aria-label="Symbol"
            @validity="catalogSymbolError = $event"
          />
        </FormField>
        <FormField
          label="Position Side"
          help="The directional exposure this order should add or establish."
          required
        >
          <select v-model="positionSide" class="input">
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </FormField>
        <SizingFields
          v-model:mode="sizingMode"
          v-model:amount="amount"
          :base-asset="units.base"
          :quote-asset="units.quote"
          @update:mode="rememberSizingMode"
        />
        <FormField
          v-if="executionKind === 'limit'"
          :label="labelWithUnit('Limit Price', units.quote)"
          help="The exact exchange price for the resting limit order."
          :error="limitPriceError"
          required
        >
          <input
            v-model="limitPrice"
            class="input"
            aria-label="Limit Price"
            :aria-description="units.quote ? 'Denominated in ' + units.quote : undefined"
            type="text"
            inputmode="decimal"
          />
        </FormField>
        <FormField
          v-if="executionKind === 'limit'"
          label="Time In Force"
          help="Good Til Canceled may take liquidity; Post Only is rejected if it would immediately execute."
          required
        >
          <select v-model="timeInForce" class="input">
            <option value="good_til_canceled">Good Til Canceled</option>
            <option value="post_only">Post Only</option>
          </select>
        </FormField>
        <ShapeFields
          v-model:mode="shapeMode"
          v-model:target-child-notional="targetChildNotional"
          v-model:max-children="maxChildren"
        />
      </div>

      <ProtectionFields
        v-model="protection"
        :account-id="selectedAccountId"
        :symbol="symbol"
        :position-side="positionSide"
        :mark-price-only="markPriceOnly"
        :base-asset="units.base"
        :quote-asset="units.quote"
      />
      <ExecutionPreviewPanel
        :account-id="selectedAccountId"
        :intent="planningIntent"
        :active="open"
        :quote-asset="units.quote"
        @update:ready="previewReady = $event"
      />

      <p v-if="!planningIntent" class="form-readiness">Fix the highlighted fields to continue.</p>

      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" @click="emit('close')">Cancel</button>
      <button
        class="btn btn-primary"
        type="submit"
        :form="`engine-${executionKind}-order`"
        :disabled="!canSubmit"
      >
        {{ submission.submitting.value ? 'Submitting…' : 'Submit' }}
      </button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.command-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.symbol-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.submission-error {
  color: var(--color-error);
  overflow-wrap: anywhere;
}
.form-readiness {
  margin: 0;
  color: var(--state-warning);
  font-size: 11px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
