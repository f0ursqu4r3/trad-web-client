<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import {
  lifecycleIntent,
  type LifecycleAction,
  type TrailingEntryAmendmentDraft,
} from '@/lib/engineCommands/lifecycle'
import { useGatewayStore } from '@/stores/gateway'

const props = defineProps<{
  open: boolean
  accountId: string
  action: LifecycleAction | null
  initialTrailingEntry?: Partial<TrailingEntryAmendmentDraft> | null
}>()
const emit = defineEmits<{ (event: 'close'): void }>()
const gateway = useGatewayStore()
const submission = useEngineCommandSubmission()
const closeMode = ref<'full' | 'base'>('full')
const closeQuantity = ref('')
const closeExecutionMode = ref<'market' | 'limit' | 'chase'>('market')
const closeLimitPrice = ref('')
const closeLimitTimeInForce = ref<'good_til_canceled' | 'post_only'>('post_only')
const closeChaseBoundaryEnabled = ref(true)
const closeChaseBoundaryMode = ref<'basis_points' | 'price'>('basis_points')
const closeChaseBoundaryValue = ref('20')
const closeChaseUntilCanceled = ref(false)
const closeChaseExpiryMinutes = ref('5')
const targetPrice = ref('')
const targetQuantity = ref('')
const amendment = ref<TrailingEntryAmendmentDraft>(emptyAmendment())
const confirmed = ref(false)
const validationError = ref<string | null>(null)

const title = computed(() => props.action?.label ?? 'Action')
const needsConfirmation = computed(
  () => props.action?.danger === true || props.action?.kind.startsWith('cancel_') === true,
)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    props.accountId !== '' &&
    props.action !== null &&
    (!needsConfirmation.value || confirmed.value) &&
    !submission.submitting.value,
)

watch(
  () => [props.open, props.action, props.initialTrailingEntry] as const,
  ([open]) => {
    if (open) reset()
  },
)

function reset(): void {
  closeMode.value = 'full'
  closeQuantity.value = ''
  closeExecutionMode.value = 'market'
  closeLimitPrice.value = ''
  closeLimitTimeInForce.value = 'post_only'
  closeChaseBoundaryEnabled.value = true
  closeChaseBoundaryMode.value = 'basis_points'
  closeChaseBoundaryValue.value = '20'
  closeChaseUntilCanceled.value = false
  closeChaseExpiryMinutes.value = '5'
  targetPrice.value = orderValue('price')
  targetQuantity.value =
    props.action?.target.kind === 'order' ? props.action.target.row.target_quantity : ''
  amendment.value = trailingEntryAmendment()
  confirmed.value = false
  validationError.value = null
  submission.clearSubmissionError()
}

async function submit(): Promise<void> {
  if (props.action === null) return
  validationError.value = null
  try {
    const intent = lifecycleIntent(props.action, {
      closeMode: closeMode.value,
      closeQuantity: closeQuantity.value,
      closeExecutionMode: closeExecutionMode.value,
      closeLimitPrice: closeLimitPrice.value,
      closeLimitTimeInForce: closeLimitTimeInForce.value,
      closeChaseBoundaryEnabled: closeChaseBoundaryEnabled.value,
      closeChaseBoundaryMode: closeChaseBoundaryMode.value,
      closeChaseBoundaryValue: closeChaseBoundaryValue.value,
      closeChaseUntilCanceled: closeChaseUntilCanceled.value,
      closeChaseExpiryMinutes: closeChaseExpiryMinutes.value,
      targetPrice: targetPrice.value,
      targetQuantity: targetQuantity.value,
      trailingEntry: amendment.value,
    })
    if (await submission.submit({ accountId: props.accountId, intent })) emit('close')
  } catch (error) {
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}

function orderValue(key: string): string {
  if (props.action?.target.kind !== 'order') return ''
  return primitiveString(props.action.target.row.current_request.execution[key])
}

function trailingEntryAmendment(): TrailingEntryAmendmentDraft {
  if (props.action?.target.kind !== 'trailing_entry') return emptyAmendment()
  const plan = props.action.target.row.plan
  const takeProfit = primitiveString(plan.take_profit)
  const initial = props.initialTrailingEntry
  return {
    activationPrice: initial?.activationPrice ?? primitiveString(plan.activation_price),
    jumpBasisPoints: initial?.jumpBasisPoints ?? primitiveString(plan.jump_threshold),
    stopLossPrice: initial?.stopLossPrice ?? primitiveString(plan.stop_loss),
    takeProfitMode: initial?.takeProfitMode ?? (takeProfit === '' ? 'unchanged' : 'set'),
    takeProfitPrice: initial?.takeProfitPrice ?? takeProfit,
    riskAmount: initial?.riskAmount ?? primitiveString(plan.risk_amount),
  }
}

function emptyAmendment(): TrailingEntryAmendmentDraft {
  return {
    activationPrice: '',
    jumpBasisPoints: '',
    stopLossPrice: '',
    takeProfitMode: 'unchanged',
    takeProfitPrice: '',
    riskAmount: '',
  }
}

function primitiveString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
</script>

<template>
  <BaseCommandModal :title="title" :open="open" @close="emit('close')">
    <form id="engine-lifecycle-action" class="action-form" @submit.prevent="submit">
      <template v-if="action?.kind === 'close_exposure'">
        <label class="field">
          <span>Close Amount</span>
          <select v-model="closeMode" class="input">
            <option value="full">Full Owned Exposure</option>
            <option value="base">Partial Base Quantity</option>
          </select>
        </label>
        <label v-if="closeMode === 'base'" class="field">
          <span>Base Quantity</span>
          <input v-model="closeQuantity" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>Execution</span>
          <select v-model="closeExecutionMode" class="input">
            <option value="market">Market</option>
            <option value="limit">Limit</option>
            <option value="chase">Chase</option>
          </select>
        </label>
        <template v-if="closeExecutionMode === 'limit'">
          <label class="field">
            <span>Limit Price</span>
            <input v-model="closeLimitPrice" class="input" type="text" inputmode="decimal" />
          </label>
          <label class="field">
            <span>Time in Force</span>
            <select v-model="closeLimitTimeInForce" class="input">
              <option value="post_only">Post Only</option>
              <option value="good_til_canceled">Good Til Canceled</option>
            </select>
          </label>
        </template>
        <template v-if="closeExecutionMode === 'chase'">
          <label class="check-field">
            <input v-model="closeChaseBoundaryEnabled" type="checkbox" />
            <span>Use adverse boundary</span>
          </label>
          <label v-if="closeChaseBoundaryEnabled" class="field">
            <span>Boundary Type</span>
            <select v-model="closeChaseBoundaryMode" class="input">
              <option value="basis_points">Distance (bps)</option>
              <option value="price">Fixed Price</option>
            </select>
          </label>
          <label v-if="closeChaseBoundaryEnabled" class="field">
            <span>{{
              closeChaseBoundaryMode === 'basis_points' ? 'Maximum Distance' : 'Boundary Price'
            }}</span>
            <input
              v-model="closeChaseBoundaryValue"
              class="input"
              type="text"
              inputmode="decimal"
            />
          </label>
          <label class="check-field">
            <input v-model="closeChaseUntilCanceled" type="checkbox" />
            <span>Run until canceled</span>
          </label>
          <label v-if="!closeChaseUntilCanceled" class="field">
            <span>Expiry (minutes)</span>
            <input
              v-model="closeChaseExpiryMinutes"
              class="input"
              type="text"
              inputmode="decimal"
            />
          </label>
          <p class="help-text">
            Chase is reduce-only and post-only. Boundary, expiry, or cancellation leaves any
            unfilled owned exposure open; it never silently falls back to Market.
          </p>
        </template>
      </template>

      <template v-if="action?.kind === 'modify_order'">
        <label class="field">
          <span>Target Price</span>
          <input v-model="targetPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>Total Base Quantity</span>
          <input v-model="targetQuantity" class="input" type="text" inputmode="decimal" />
        </label>
        <p class="help-text">Total quantity cannot be below the quantity already filled.</p>
      </template>

      <template v-if="action?.kind === 'amend_trailing_entry'">
        <label class="field">
          <span>Activation Price</span>
          <input
            v-model="amendment.activationPrice"
            class="input"
            type="text"
            inputmode="decimal"
          />
        </label>
        <label class="field">
          <span>Jump Threshold (bps)</span>
          <input
            v-model="amendment.jumpBasisPoints"
            class="input"
            type="text"
            inputmode="decimal"
          />
        </label>
        <label class="field">
          <span>Stop Loss Price</span>
          <input v-model="amendment.stopLossPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>Risk Amount</span>
          <input v-model="amendment.riskAmount" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>Take Profit Change</span>
          <select v-model="amendment.takeProfitMode" class="input">
            <option value="unchanged">Keep Current</option>
            <option value="set">Set Price</option>
            <option value="clear">Clear</option>
          </select>
        </label>
        <label v-if="amendment.takeProfitMode === 'set'" class="field">
          <span>Take Profit Price</span>
          <input
            v-model="amendment.takeProfitPrice"
            class="input"
            type="text"
            inputmode="decimal"
          />
        </label>
      </template>

      <p v-if="action?.kind === 'close_trailing_entry'" class="help-text">
        Cancels remaining entry work, closes established owned exposure reduce-only, and settles
        protection.
      </p>
      <p v-else-if="action?.kind === 'enter_trailing_entry'" class="help-text">
        Commits entry immediately from the latest authoritative Trailing Entry state.
      </p>
      <p v-else-if="action?.kind === 'continue_trailing_entry'" class="help-text">
        Resumes the paused entry from its committed trigger and current exchange evidence.
      </p>
      <p v-else-if="action?.kind === 'activate_trailing_entry'" class="help-text">
        Starts tracking immediately without waiting for the configured activation price.
      </p>

      <label v-if="needsConfirmation" class="confirm-row">
        <input v-model="confirmed" type="checkbox" />
        Confirm {{ title.toLowerCase() }}
      </label>
      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" @click="emit('close')">Back</button>
      <button
        class="btn"
        :class="action?.danger ? 'btn-danger' : 'btn-primary'"
        type="submit"
        form="engine-lifecycle-action"
        :disabled="!canSubmit"
      >
        {{ submission.submitting.value ? 'Submitting…' : title }}
      </button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.action-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.help-text,
.check-field,
.confirm-row,
.submission-error {
  grid-column: 1 / -1;
}
.help-text {
  margin: 0;
  color: var(--color-text-dim);
}
.confirm-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.check-field {
  display: flex;
  align-items: center;
  gap: 7px;
}
.submission-error {
  color: var(--color-error);
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .action-form {
    grid-template-columns: 1fr;
  }
}
</style>
