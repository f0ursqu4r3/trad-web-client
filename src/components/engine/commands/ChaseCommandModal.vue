<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import type { PositionSideIntent } from '@/lib/gateway'
import {
  newProtectionState,
  type ProtectionFormState,
  type SizingMode,
} from '@/lib/engineCommands/form'
import { buildPlaceChaseIntent } from '@/lib/engineCommands/intents'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import ProtectionFields from './ProtectionFields.vue'
import SizingFields from './SizingFields.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
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
const canSubmit = computed(
  () => gateway.isConnected && selectedAccountId.value !== '' && !submission.submitting.value,
)

watch(selectedAccountId, (accountId, prior) => {
  if (accountId !== '' && accountId !== prior)
    symbol.value = accounts.getDefaultSymbolForAccount(accountId)
})

function reset(): void {
  selectedAccountId.value = accounts.selectedAccountId ?? accounts.accounts[0]?.id ?? ''
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  positionSide.value = 'long'
  sizingMode.value = 'quote_notional'
  amount.value = '50'
  boundaryKind.value = 'none'
  boundaryValue.value = ''
  expirySeconds.value = ''
  remainder.value = 'cancel'
  protection.value = newProtectionState()
  validationError.value = null
  submission.clearSubmissionError()
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
    const intent = buildPlaceChaseIntent({
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
    if (await submission.submit({ accountId: selectedAccountId.value, intent })) emit('close')
  } catch (error) {
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <BaseCommandModal title="Chase Order" :open="open" @close="emit('close')">
    <form id="engine-chase-order" class="command-form" @submit.prevent="submit">
      <div class="form-grid">
        <label class="field">
          <span>Account</span>
          <select v-model="selectedAccountId" class="input">
            <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
              {{ account.label }} · {{ account.exchange }} · {{ account.network }}
            </option>
          </select>
        </label>
        <label class="field"><span>Symbol</span><input v-model="symbol" class="input" /></label>
        <label class="field">
          <span>Position Side</span>
          <select v-model="positionSide" class="input">
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <SizingFields v-model:mode="sizingMode" v-model:amount="amount" />
        <label class="field">
          <span>Adverse Boundary</span>
          <select v-model="boundaryKind" class="input">
            <option value="none">None</option>
            <option value="basis_points">Basis Points</option>
            <option value="price">Fixed Price</option>
          </select>
        </label>
        <label v-if="boundaryKind !== 'none'" class="field">
          <span>{{ boundaryKind === 'price' ? 'Boundary Price' : 'Boundary Basis Points' }}</span>
          <input v-model="boundaryValue" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>Expiry Seconds</span>
          <input
            v-model="expirySeconds"
            class="input"
            type="text"
            inputmode="numeric"
            placeholder="No expiry"
          />
        </label>
        <label class="field">
          <span>On Expiry / Boundary</span>
          <select v-model="remainder" class="input">
            <option value="cancel">Cancel Remainder</option>
            <option value="market_fill" disabled>Market Fill (not implemented)</option>
          </select>
        </label>
      </div>
      <ProtectionFields v-model="protection" />
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
