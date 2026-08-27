<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import MarketSymbolCombobox from '@/components/forms/MarketSymbolCombobox.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import { useTelemetryAction } from '@/composables/useTelemetryAction'
import type { PositionSideIntent } from '@/lib/gateway'
import { type ShapeMode } from '@/lib/engineCommands/form'
import { buildPlaceTrailingEntryIntent, previewIntent } from '@/lib/engineCommands/intents'
import { labelWithUnit, marketUnits } from '@/lib/engineCommands/marketUnits'
import type { TrailingEntryCommandPrefill } from '@/lib/engineCommands/prefill'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useModalStore } from '@/stores/modals'
import ShapeFields from './ShapeFields.vue'
import ExecutionPreviewPanel from './ExecutionPreviewPanel.vue'
import LiveMarketPrice from './LiveMarketPrice.vue'
import FormField from '@/components/forms/FormField.vue'
import StopPricePresets from '@/components/forms/StopPricePresets.vue'
import { decimalError, symbolError } from '@/lib/formValidation'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const modals = useModalStore()
const submission = useEngineCommandSubmission()
const selectedAccountId = ref('')
const telemetryAction = useTelemetryAction({
  open: () => props.open,
  accountId: () => selectedAccountId.value || null,
  actionKind: () => 'place_trailing_entry',
  source: 'trailing_entry_modal',
})
const symbol = ref('')
const positionSide = ref<PositionSideIntent>('long')
const activationPrice = ref('')
const jumpBasisPoints = ref('10')
const stopLossPrice = ref('')
const takeProfitPrice = ref('')
const riskAmount = ref('50')
const shapeMode = ref<ShapeMode>('single')
const targetChildNotional = ref('')
const maxChildren = ref('20')
const oneWaySemantics = ref<'delta' | 'target_side_exposure'>('delta')
const validationError = ref<string | null>(null)
const catalogSymbolError = ref<string | null>(null)
const previewReady = ref(false)

const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const isHyperliquid = computed(() => selectedAccount.value?.exchange === 'hyperliquid')
const units = computed(() => marketUnits(selectedAccount.value, symbol.value))
const accountError = computed(() =>
  selectedAccountId.value === '' ? 'Trading account is required' : null,
)
const trailingSymbolError = computed(() => symbolError(symbol.value) || catalogSymbolError.value)
const activationError = computed(() => decimalError(activationPrice.value, 'activation price'))
const jumpError = computed(() => decimalError(jumpBasisPoints.value, 'jump threshold'))
const stopError = computed(() => decimalError(stopLossPrice.value, 'stop-loss price'))
const takeProfitError = computed(() =>
  decimalError(takeProfitPrice.value, 'take-profit price', { optional: true }),
)
const riskError = computed(() => decimalError(riskAmount.value, 'risk amount'))
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
  const prefill = modals.modalValues.EngineTrailingEntry as TrailingEntryCommandPrefill | undefined
  selectedAccountId.value =
    prefill?.accountId ?? accounts.selectedAccountId ?? accounts.accounts[0]?.id ?? ''
  symbol.value = prefill?.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  positionSide.value = prefill?.positionSide ?? 'long'
  activationPrice.value = prefill?.activationPrice ?? ''
  jumpBasisPoints.value = prefill?.jumpBasisPoints ?? '10'
  stopLossPrice.value = prefill?.stopLossPrice ?? ''
  takeProfitPrice.value = prefill?.takeProfitPrice ?? ''
  riskAmount.value = prefill?.riskAmount ?? '50'
  shapeMode.value = prefill?.shapeMode ?? 'single'
  targetChildNotional.value = prefill?.targetChildNotional ?? ''
  maxChildren.value = prefill?.maxChildren ?? '20'
  oneWaySemantics.value = prefill?.oneWaySemantics ?? 'delta'
  validationError.value = null
  previewReady.value = false
  submission.clearSubmissionError()
}

function applyAccountDefaults(): void {
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  oneWaySemantics.value = 'delta'
}

async function submit(): Promise<void> {
  validationError.value = null
  const actionAttemptId = telemetryAction.confirm()
  try {
    const intent = buildIntent()
    if (await submission.submit({ accountId: selectedAccountId.value, intent }, actionAttemptId)) {
      emit('close')
    }
  } catch (error) {
    telemetryAction.validationFailed()
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}

function closeModal(): void {
  telemetryAction.cancel()
  emit('close')
}

function buildIntent() {
  return buildPlaceTrailingEntryIntent({
    symbol: symbol.value,
    positionSide: positionSide.value,
    activationPrice: activationPrice.value,
    jumpBasisPoints: jumpBasisPoints.value,
    stopLossPrice: stopLossPrice.value,
    takeProfitPrice: takeProfitPrice.value,
    riskAmount: riskAmount.value,
    shapeMode: shapeMode.value,
    targetChildNotional: targetChildNotional.value,
    maxChildren: maxChildren.value,
    oneWaySemantics: isHyperliquid.value ? oneWaySemantics.value : 'delta',
  })
}
</script>

<template>
  <BaseCommandModal title="Trailing Entry" :open="open" @close="closeModal">
    <form id="engine-trailing-entry" class="command-form" @submit.prevent="submit">
      <div class="form-grid">
        <FormField
          label="Account"
          help="The configured exchange account that will own this trailing entry."
          :error="accountError"
          required
        >
          <select v-model="selectedAccountId" class="input" @change="applyAccountDefaults">
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.label }} · {{ account.exchange }} · {{ account.network }}
            </option>
          </select>
        </FormField>
        <FormField
          help="Exchange instrument symbol, such as BTC. Trad normalizes it to uppercase."
          :error="trailingSymbolError"
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
          help="The side Trad will enter after the activation and jump conditions are satisfied."
          required
        >
          <select v-model="positionSide" class="input">
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </FormField>
        <FormField
          :label="labelWithUnit('Risk at Stop', units.quote)"
          help="Maximum quote-currency loss between the eventual entry and the stop-loss price."
          :error="riskError"
          required
        >
          <input
            v-model="riskAmount"
            class="input"
            aria-label="Risk Amount"
            type="text"
            inputmode="decimal"
          />
        </FormField>
        <FormField
          :label="labelWithUnit('Activation Price', units.quote)"
          help="Price that arms the trailing entry. No entry is submitted before activation."
          :error="activationError"
          required
        >
          <input
            v-model="activationPrice"
            class="input"
            aria-label="Activation Price"
            type="text"
            inputmode="decimal"
          />
        </FormField>
        <FormField
          label="Jump Threshold (bps)"
          help="Required reversal from the best post-activation price. One basis point is 0.01%."
          :error="jumpError"
          required
        >
          <input v-model="jumpBasisPoints" class="input" type="text" inputmode="decimal" />
        </FormField>
        <FormField
          :label="labelWithUnit('Stop Loss Price', units.quote)"
          help="Mandatory stop-market triggered by mark price. It is used both for risk sizing and post-entry protection."
          :error="stopError"
          required
        >
          <input
            v-model="stopLossPrice"
            class="input"
            aria-label="Stop Loss Price"
            type="text"
            inputmode="decimal"
          />
          <StopPricePresets
            v-model="stopLossPrice"
            :account-id="selectedAccountId"
            :symbol="symbol"
            :position-side="positionSide"
          />
        </FormField>
        <FormField
          :label="labelWithUnit('Take Profit Price', units.quote)"
          help="Optional price for a full take-profit after entry."
          :error="takeProfitError"
          optional
        >
          <input
            v-model="takeProfitPrice"
            class="input"
            aria-label="Take Profit Price (optional)"
            type="text"
            inputmode="decimal"
          />
        </FormField>
        <FormField
          v-if="isHyperliquid"
          class="one-way-field"
          label="Hyperliquid One-Way Behavior"
          help="Controls how Trad handles existing exposure because Hyperliquid cannot hold long and short simultaneously."
          required
        >
          <select v-model="oneWaySemantics" class="input">
            <option value="delta">Add Requested Quantity</option>
            <option value="target_side_exposure">Reach Target-Side Exposure</option>
          </select>
          <small>
            Hyperliquid cannot hold both sides. An opposite position is reduced before the requested
            side is established.
          </small>
        </FormField>
        <ShapeFields
          v-model:mode="shapeMode"
          v-model:target-child-notional="targetChildNotional"
          v-model:max-children="maxChildren"
        />
      </div>

      <ExecutionPreviewPanel
        :account-id="selectedAccountId"
        :intent="planningIntent"
        :active="open"
        :action-attempt-id="telemetryAction.actionAttemptId.value"
        :quote-asset="units.quote"
        @update:ready="previewReady = $event"
      />

      <p v-if="!planningIntent" class="form-readiness">Fix the highlighted fields to continue.</p>

      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" @click="closeModal">Cancel</button>
      <button
        class="btn btn-primary"
        type="submit"
        form="engine-trailing-entry"
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
.one-way-field {
  grid-column: 1 / -1;
}
.one-way-field small {
  color: var(--color-text-dim);
  overflow-wrap: anywhere;
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
