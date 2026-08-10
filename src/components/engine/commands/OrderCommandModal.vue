<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import type { PositionSideIntent, TimeInForceIntent } from '@/lib/gateway'
import {
  newProtectionState,
  type ProtectionFormState,
  type ShapeMode,
  type SizingMode,
} from '@/lib/engineCommands/form'
import { buildPlaceOrderIntent, previewIntent } from '@/lib/engineCommands/intents'
import type { OrderCommandPrefill } from '@/lib/engineCommands/prefill'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useModalStore } from '@/stores/modals'
import ProtectionFields from './ProtectionFields.vue'
import ExecutionPreviewPanel from './ExecutionPreviewPanel.vue'
import ShapeFields from './ShapeFields.vue'
import SizingFields from './SizingFields.vue'

const props = defineProps<{ open: boolean; executionKind: 'market' | 'limit' }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const modals = useModalStore()
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
const protection = ref<ProtectionFormState>(newProtectionState())
const validationError = ref<string | null>(null)

const title = computed(() => (props.executionKind === 'market' ? 'Market Order' : 'Limit Order'))
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
  const modalName = props.executionKind === 'market' ? 'EngineMarketOrder' : 'EngineLimitOrder'
  const prefill = modals.modalValues[modalName] as OrderCommandPrefill | undefined
  selectedAccountId.value =
    prefill?.accountId ?? accounts.selectedAccountId ?? accounts.accounts[0]?.id ?? ''
  symbol.value = prefill?.symbol ?? accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  positionSide.value = prefill?.positionSide ?? 'long'
  sizingMode.value = prefill?.sizingMode ?? 'quote_notional'
  amount.value = prefill?.amount ?? '50'
  limitPrice.value = prefill?.limitPrice ?? ''
  timeInForce.value = prefill?.timeInForce ?? 'good_til_canceled'
  shapeMode.value = prefill?.shapeMode ?? 'single'
  targetChildNotional.value = prefill?.targetChildNotional ?? ''
  maxChildren.value = prefill?.maxChildren ?? '20'
  protection.value = structuredClone(prefill?.protection ?? newProtectionState())
  validationError.value = null
  submission.clearSubmissionError()
}

function applyAccountDefaultSymbol(): void {
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
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
  <BaseCommandModal :title="title" :open="open" @close="emit('close')">
    <form :id="`engine-${executionKind}-order`" class="command-form" @submit.prevent="submit">
      <div class="form-grid">
        <label class="field">
          <span>Account</span>
          <select v-model="selectedAccountId" class="input" @change="applyAccountDefaultSymbol">
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
        <SizingFields v-model:mode="sizingMode" v-model:amount="amount" />
        <label v-if="executionKind === 'limit'" class="field">
          <span>Limit Price</span>
          <input v-model="limitPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label v-if="executionKind === 'limit'" class="field">
          <span>Time In Force</span>
          <select v-model="timeInForce" class="input">
            <option value="good_til_canceled">Good Til Canceled</option>
            <option value="post_only">Post Only</option>
          </select>
        </label>
        <ShapeFields
          v-model:mode="shapeMode"
          v-model:target-child-notional="targetChildNotional"
          v-model:max-children="maxChildren"
        />
      </div>

      <ProtectionFields v-model="protection" />
      <ExecutionPreviewPanel
        :account-id="selectedAccountId"
        :intent="planningIntent"
        :active="open"
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
