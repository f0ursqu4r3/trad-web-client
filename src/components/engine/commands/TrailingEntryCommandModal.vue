<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
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

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const modals = useModalStore()
const submission = useEngineCommandSubmission()
const selectedAccountId = ref('')
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

const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const isHyperliquid = computed(() => selectedAccount.value?.exchange === 'hyperliquid')
const units = computed(() => marketUnits(selectedAccount.value, symbol.value))
const canSubmit = computed(
  () => gateway.isConnected && selectedAccountId.value !== '' && !submission.submitting.value,
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
  submission.clearSubmissionError()
}

function applyAccountDefaults(): void {
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  oneWaySemantics.value = 'delta'
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
  <BaseCommandModal title="Trailing Entry" :open="open" @close="emit('close')">
    <form id="engine-trailing-entry" class="command-form" @submit.prevent="submit">
      <div class="form-grid">
        <label class="field">
          <span>Account</span>
          <select v-model="selectedAccountId" class="input" @change="applyAccountDefaults">
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.label }} · {{ account.exchange }} · {{ account.network }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Symbol</span>
          <input v-model="symbol" class="input" autocomplete="off" />
        </label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="positionSide" class="input">
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label class="field">
          <span>{{ labelWithUnit('Risk at Stop', units.quote) }}</span>
          <input v-model="riskAmount" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>{{ labelWithUnit('Activation Price', units.quote) }}</span>
          <input v-model="activationPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>Jump Threshold (bps)</span>
          <input v-model="jumpBasisPoints" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>{{ labelWithUnit('Stop Loss Price', units.quote) }}</span>
          <input v-model="stopLossPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>{{ labelWithUnit('Take Profit Price', units.quote) }} (optional)</span>
          <input v-model="takeProfitPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label v-if="isHyperliquid" class="field one-way-field">
          <span>Hyperliquid One-Way Behavior</span>
          <select v-model="oneWaySemantics" class="input">
            <option value="delta">Add Requested Quantity</option>
            <option value="target_side_exposure">Reach Target-Side Exposure</option>
          </select>
          <small>
            Hyperliquid cannot hold both sides. An opposite position is reduced before the requested
            side is established.
          </small>
        </label>
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
        :quote-asset="units.quote"
      />

      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" @click="emit('close')">Cancel</button>
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
@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
