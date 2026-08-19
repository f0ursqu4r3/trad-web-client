<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import type { PositionSideIntent } from '@/lib/gateway'
import {
  copyProtectionState,
  newProtectionState,
  sizingModeFromPreference,
  sizingModePreference,
  type ProtectionFormState,
  type SizingMode,
} from '@/lib/engineCommands/form'
import { buildPlaceChaseIntent, previewIntent } from '@/lib/engineCommands/intents'
import { labelWithUnit, marketUnits } from '@/lib/engineCommands/marketUnits'
import type { ChaseCommandPrefill } from '@/lib/engineCommands/prefill'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useModalStore } from '@/stores/modals'
import { useUiStore } from '@/stores/ui'
import ProtectionFields from './ProtectionFields.vue'
import ExecutionPreviewPanel from './ExecutionPreviewPanel.vue'
import LiveMarketPrice from './LiveMarketPrice.vue'
import SizingFields from './SizingFields.vue'
import FormField from '@/components/forms/FormField.vue'
import { decimalError, integerError, symbolError } from '@/lib/formValidation'

const props = defineProps<{ open: boolean }>()
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
const boundaryKind = ref<'none' | 'basis_points' | 'price'>('none')
const boundaryValue = ref('')
const expirySeconds = ref('')
const remainder = ref<'cancel' | 'market_fill'>('cancel')
const protection = ref<ProtectionFormState>(newProtectionState())
const validationError = ref<string | null>(null)
const previewReady = ref(false)
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const units = computed(() => marketUnits(selectedAccount.value, symbol.value))
const accountError = computed(() =>
  selectedAccountId.value === '' ? 'Trading account is required' : null,
)
const chaseSymbolError = computed(() => symbolError(symbol.value))
const boundaryError = computed(() => {
  if (boundaryKind.value === 'none') return null
  return decimalError(
    boundaryValue.value,
    boundaryKind.value === 'price' ? 'boundary price' : 'boundary basis points',
    { allowZero: boundaryKind.value === 'basis_points' },
  )
})
const expiryError = computed(() =>
  expirySeconds.value.trim() === '' ? null : integerError(expirySeconds.value, 'Expiry seconds', 1),
)
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

function reset(): void {
  const prefill = modals.modalValues.EngineChaseOrder as ChaseCommandPrefill | undefined
  selectedAccountId.value =
    prefill?.accountId ?? accounts.selectedAccountId ?? accounts.accounts[0]?.id ?? ''
  symbol.value = prefill?.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  positionSide.value = prefill?.positionSide ?? 'long'
  sizingMode.value = prefill?.sizingMode ?? sizingModeFromPreference(ui.orderQuantityMode)
  amount.value = prefill?.amount ?? '50'
  boundaryKind.value = prefill?.boundaryKind ?? 'none'
  boundaryValue.value = prefill?.boundaryValue ?? ''
  expirySeconds.value = prefill?.expirySeconds ?? ''
  remainder.value = prefill?.remainder ?? 'cancel'
  protection.value = copyProtectionState(prefill?.protection ?? newProtectionState())
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

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

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
  return buildPlaceChaseIntent({
    symbol: symbol.value,
    positionSide: positionSide.value,
    sizingMode: sizingMode.value,
    amount: amount.value,
    boundaryKind: boundaryKind.value,
    boundaryValue: boundaryValue.value,
    expirySeconds: expirySeconds.value,
    remainder: remainder.value,
    protection: protection.value,
  })
}
</script>

<template>
  <BaseCommandModal title="Chase Order" :open="open" size="wide" @close="emit('close')">
    <form id="engine-chase-order" class="command-form" @submit.prevent="submit">
      <div class="form-grid">
        <FormField
          label="Account"
          help="The configured exchange account that will own this chase order."
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
          :error="chaseSymbolError"
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
          <input v-model="symbol" class="input" />
        </FormField>
        <FormField
          label="Position Side"
          help="The directional exposure the chase should add or establish."
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
          label="Adverse Boundary"
          help="Optional hard boundary that stops chasing when price moves too far against the order."
          optional
        >
          <select v-model="boundaryKind" class="input">
            <option value="none">None</option>
            <option value="basis_points">Basis Points</option>
            <option value="price">Fixed Price</option>
          </select>
        </FormField>
        <FormField
          v-if="boundaryKind !== 'none'"
          :label="
            boundaryKind === 'price'
              ? labelWithUnit('Boundary Price', units.quote)
              : 'Boundary Basis Points'
          "
          :help="
            boundaryKind === 'price'
              ? 'Absolute price beyond which Trad stops repricing the chase.'
              : 'Maximum adverse distance from the initial reference price. One basis point is 0.01%.'
          "
          :error="boundaryError"
          required
        >
          <input v-model="boundaryValue" class="input" type="text" inputmode="decimal" />
        </FormField>
        <FormField
          label="Expiry Seconds"
          help="Optional whole-number lifetime. Leave blank to chase until filled, canceled, or bounded."
          :error="expiryError"
          optional
        >
          <input
            v-model="expirySeconds"
            class="input"
            type="text"
            inputmode="numeric"
            placeholder="No expiry"
          />
        </FormField>
        <FormField
          label="On Expiry / Boundary"
          help="What Trad does with any unfilled remainder after the chase stops."
          required
        >
          <select v-model="remainder" class="input">
            <option value="cancel">Cancel Remainder</option>
            <option value="market_fill" disabled>Market Fill (not implemented)</option>
          </select>
        </FormField>
      </div>
      <ProtectionFields v-model="protection" :base-asset="units.base" :quote-asset="units.quote" />
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
        form="engine-chase-order"
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
