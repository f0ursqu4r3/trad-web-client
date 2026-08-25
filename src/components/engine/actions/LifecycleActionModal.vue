<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import {
  actionOwnedExposure,
  lifecycleIntent,
  type LifecycleAction,
  type TrailingEntryAmendmentDraft,
} from '@/lib/engineCommands/lifecycle'
import { percentToFraction } from '@/lib/engineCommands/form'
import { labelWithUnit, marketUnits } from '@/lib/engineCommands/marketUnits'
import {
  formatExactDecimal,
  isExactZero,
  multiplyExact,
  subtractExact,
} from '@/lib/exactDecimalMath'
import { useAccountsStore } from '@/stores/accounts'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useGatewayStore } from '@/stores/gateway'
import { useMarketStore } from '@/stores/market'

const props = defineProps<{
  open: boolean
  accountId: string
  action: LifecycleAction | null
  initialTrailingEntry?: Partial<TrailingEntryAmendmentDraft> | null
  initialClosePercent?: string | null
  initialCloseExecution?: 'market' | 'limit' | 'chase'
}>()
const emit = defineEmits<{ (event: 'close'): void }>()
const gateway = useGatewayStore()
const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const markets = useMarketStore()
const submission = useEngineCommandSubmission()
const closeMode = ref<'full' | 'percent' | 'base'>('full')
const closePercent = ref('25')
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
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === props.accountId) ?? null,
)
const actionSymbol = computed(() => {
  switch (props.action?.target.kind) {
    case 'order':
      return props.action.target.row.current_request.symbol
    case 'chase':
      return primitiveString(props.action.target.row.plan.symbol)
    case 'trailing_entry':
      return props.action.target.row.plan.symbol
    default:
      return ''
  }
})
const units = computed(() => marketUnits(selectedAccount.value, actionSymbol.value))
const ownedExposure = computed(() =>
  actionOwnedExposure(props.action, projections.selectedLive?.positions ?? []),
)
const ownedQuantity = computed(() => ownedExposure.value?.remaining_quantity ?? '0')
const closeQuantityResolved = computed(() => {
  if (closeMode.value === 'full') return ownedQuantity.value
  if (closeMode.value === 'base') return closeQuantity.value.trim()
  try {
    return multiplyExact(
      ownedQuantity.value,
      percentToFraction(closePercent.value, 'close percentage'),
    )
  } catch {
    return ''
  }
})
const closeRemainder = computed(() => {
  if (closeQuantityResolved.value === '') return '-'
  try {
    return subtractExact(ownedQuantity.value, closeQuantityResolved.value)
  } catch {
    return '-'
  }
})
const latestMarketPrice = computed(() => {
  const stream = markets.stream(props.accountId || null, actionSymbol.value || null)
  return stream?.samples[stream.samples.length - 1]?.price ?? null
})
const latestFillPrice = computed(() => {
  const action = props.action
  const graph = projections.selectedLive
  if (action === null || graph === null) return null
  const orderIds = new Set(
    graph.orders
      .filter((order) => order.command_id === action.command.command_id)
      .map((order) => order.order_id),
  )
  return (
    graph.executions
      .filter((execution) => execution.order !== null && orderIds.has(execution.order.order_id))
      .sort((left, right) => right.fill.occurred_at - left.fill.occurred_at)[0]?.fill.price ?? null
  )
})
const closeReferencePrice = computed(() => latestMarketPrice.value ?? latestFillPrice.value)
const closeReferenceLabel = computed(() =>
  latestMarketPrice.value !== null
    ? 'Latest Market'
    : latestFillPrice.value !== null
      ? 'Last Fill'
      : '',
)
const closeNotional = computed(() => {
  if (closeReferencePrice.value === null || closeQuantityResolved.value === '') return null
  try {
    return multiplyExact(closeQuantityResolved.value, closeReferencePrice.value)
  } catch {
    return null
  }
})
const closeSizingError = computed(() => {
  if (props.action?.kind !== 'close_exposure') return null
  if (ownedExposure.value === null) return 'Owned exposure is no longer available.'
  if (closeMode.value === 'percent' && /^0+(?:\.0+)?$/.test(closePercent.value.trim())) {
    return 'Close amount must be greater than zero.'
  }
  if (closeQuantityResolved.value === '') return 'Enter a valid close amount.'
  try {
    if (isExactZero(closeQuantityResolved.value)) return 'Close amount must be greater than zero.'
    const remainder = subtractExact(ownedQuantity.value, closeQuantityResolved.value)
    if (remainder.startsWith('-')) return 'Close amount exceeds this command-owned exposure.'
  } catch {
    return 'Enter a valid close amount.'
  }
  return null
})

const title = computed(() => props.action?.label ?? 'Action')
const needsConfirmation = computed(
  () =>
    props.action?.kind !== 'close_exposure' &&
    (props.action?.danger === true || props.action?.kind.startsWith('cancel_') === true),
)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    props.accountId !== '' &&
    props.action !== null &&
    closeSizingError.value === null &&
    (!needsConfirmation.value || confirmed.value) &&
    !submission.submitting.value,
)

watch(
  () =>
    [
      props.open,
      props.action,
      props.initialTrailingEntry,
      props.initialClosePercent,
      props.initialCloseExecution,
    ] as const,
  ([open]) => {
    if (open) reset()
  },
)

function reset(): void {
  closeMode.value = props.initialClosePercent == null ? 'full' : 'percent'
  closePercent.value = props.initialClosePercent ?? '25'
  closeQuantity.value = ''
  closeExecutionMode.value = props.initialCloseExecution ?? 'market'
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
      closePercent: closePercent.value,
      closeQuantity: closeQuantityResolved.value,
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

function chooseClosePercent(percent: string): void {
  if (percent === '100') {
    closeMode.value = 'full'
    return
  }
  closePercent.value = percent
}
</script>

<template>
  <BaseCommandModal
    :title="title"
    :open="open"
    :blur-backdrop="action?.kind !== 'close_exposure'"
    @close="emit('close')"
  >
    <form id="engine-lifecycle-action" class="action-form" @submit.prevent="submit">
      <template v-if="action?.kind === 'close_exposure'">
        <section class="close-context" data-testid="close-exposure-context">
          <div>
            <span>Source Exposure</span>
            <strong>
              {{ actionSymbol }} · {{ ownedExposure?.side ?? '-' }} ·
              {{ formatExactDecimal(ownedQuantity) }} {{ units.base ?? '' }}
            </strong>
          </div>
          <div>
            <span>Selected Close</span>
            <strong>
              {{ closeQuantityResolved ? formatExactDecimal(closeQuantityResolved) : '-' }}
              {{ units.base ?? '' }}
            </strong>
          </div>
          <div>
            <span>Owned Remainder</span>
            <strong>
              {{ closeRemainder === '-' ? '-' : formatExactDecimal(closeRemainder) }}
              {{ units.base ?? '' }}
            </strong>
          </div>
          <div>
            <span>
              Estimated Notional<span v-if="closeReferenceLabel"> · {{ closeReferenceLabel }}</span>
            </span>
            <strong>
              {{ closeNotional === null ? '-' : formatExactDecimal(closeNotional) }}
              {{ closeNotional === null ? '' : (units.quote ?? '') }}
            </strong>
          </div>
        </section>
        <label class="field">
          <span>Close Amount</span>
          <select v-model="closeMode" class="input">
            <option value="full">Full Owned Exposure</option>
            <option value="percent">Percentage of Owned Exposure</option>
            <option value="base">Partial Base Quantity</option>
          </select>
        </label>
        <label v-if="closeMode === 'percent'" class="field">
          <span>Close Percentage (%)</span>
          <input v-model="closePercent" class="input" type="text" inputmode="decimal" />
        </label>
        <div v-if="closeMode === 'percent'" class="percent-presets" aria-label="Close percentage">
          <button
            v-for="percent in ['25', '50', '75', '100']"
            :key="percent"
            class="btn btn-sm"
            type="button"
            @click="chooseClosePercent(percent)"
          >
            {{ percent }}%
          </button>
        </div>
        <label v-if="closeMode === 'base'" class="field">
          <span>{{ labelWithUnit('Base Quantity', units.base) }}</span>
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
            <span>{{ labelWithUnit('Limit Price', units.quote) }}</span>
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
              closeChaseBoundaryMode === 'basis_points'
                ? 'Maximum Distance (bps)'
                : labelWithUnit('Boundary Price', units.quote)
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
            Chase is post-only and closes exactly the selected Trad-owned quantity. Boundary,
            expiry, or cancellation leaves any unfilled owned exposure open; it never silently falls
            back to Market.
          </p>
        </template>
      </template>

      <template v-if="action?.kind === 'modify_order'">
        <label class="field">
          <span>{{ labelWithUnit('Target Price', units.quote) }}</span>
          <input v-model="targetPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>{{ labelWithUnit('Total Base Quantity', units.base) }}</span>
          <input v-model="targetQuantity" class="input" type="text" inputmode="decimal" />
        </label>
        <p class="help-text">Total quantity cannot be below the quantity already filled.</p>
      </template>

      <template v-if="action?.kind === 'amend_trailing_entry'">
        <label class="field">
          <span>{{ labelWithUnit('Activation Price', units.quote) }}</span>
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
          <span>{{ labelWithUnit('Stop Loss Price', units.quote) }}</span>
          <input v-model="amendment.stopLossPrice" class="input" type="text" inputmode="decimal" />
        </label>
        <label class="field">
          <span>{{ labelWithUnit('Risk at Stop', units.quote) }}</span>
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
          <span>{{ labelWithUnit('Take Profit Price', units.quote) }}</span>
          <input
            v-model="amendment.takeProfitPrice"
            class="input"
            type="text"
            inputmode="decimal"
          />
        </label>
      </template>

      <p v-if="action?.kind === 'close_trailing_entry'" class="help-text">
        Cancels remaining entry work, closes exactly the established Trad-owned exposure, and
        settles protection.
      </p>
      <p v-else-if="action?.kind === 'take_over_exposure'" class="help-text">
        Stop Trad management; leave the exchange position open. Trad will cancel every working
        entry/close order and protection child for this command, then detach
        {{ formatExactDecimal(ownedQuantity) }} of remaining managed exposure. It will not close or
        flatten the exchange position. Any remaining position becomes outside Trad control.
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
      <p
        v-if="closeSizingError || validationError || submission.submissionError.value"
        class="submission-error"
      >
        {{ closeSizingError || validationError || submission.submissionError.value }}
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
.submission-error,
.close-context,
.percent-presets {
  grid-column: 1 / -1;
}
.close-context {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-block: 1px solid var(--border-color);
}
.close-context > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
}
.close-context span {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}
.close-context strong {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 12px;
  font-weight: normal;
}
.percent-presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
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
