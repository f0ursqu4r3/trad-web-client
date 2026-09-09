<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { formatExactDecimal } from '@/lib/exactDecimalMath'
import { useExecutionPreview, type ExecutionPreviewStatus } from '@/composables/useExecutionPreview'
import { affordabilityAdvisory } from '@/lib/engineCommands/affordability'
import { AffordabilityTransitionTracker } from '@/lib/engineCommands/affordabilityTelemetry'
import {
  loadHyperliquidCapacity,
  type HyperliquidCapacity,
} from '@/lib/engineCommands/hyperliquidCapacity'
import type { BrowserPreviewIntent } from '@/lib/gateway'
import { previewRejectionRemediation } from '@/lib/engineCommands/previewRemediation'
import { recordTelemetry } from '@/lib/telemetry'
import { ExchangeType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps<{
  accountId: string
  intent: BrowserPreviewIntent | null
  active: boolean
  quoteAsset?: string | null
  compact?: boolean
  actionAttemptId?: string | null
}>()
const emit = defineEmits<{
  (event: 'update:ready', ready: boolean): void
  (event: 'update:status', status: ExecutionPreviewStatus): void
}>()

const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const previewRoot = ref<HTMLElement | null>(null)
const editing = ref(false)
const venueCapacity = ref<HyperliquidCapacity | null>(null)
const acceptedPlanFingerprint = ref<string | null>(null)
const { error, guidance, pending, preview, ready, status } = useExecutionPreview({
  accountId: () => props.accountId,
  intent: () => props.intent,
  active: () => props.active,
  actionAttemptId: () => props.actionAttemptId,
  editing,
})
const account = computed(() => accounts.accounts.find((row) => row.id === props.accountId) ?? null)
const projection = computed(() => projections.byAccount[props.accountId] ?? null)
const available = computed(
  () =>
    projection.value?.view?.live.balances.find(
      (balance) => balance.asset === (props.quoteAsset ?? 'USDC'),
    )?.available ?? null,
)
const configuredLeverage = computed(() => {
  const metadata = account.value?.exchange_metadata
  const symbol = preview.value?.symbol.toUpperCase()
  if (!symbol) return null
  return metadata?.symbol_leverage_overrides?.[symbol] ?? metadata?.default_leverage ?? null
})
const affordability = computed(() =>
  affordabilityAdvisory(preview.value, {
    hyperliquid: account.value?.exchange === ExchangeType.Hyperliquid,
    projectionReady: projection.value?.status === 'ready',
    projectionRevision: projection.value?.view?.live.checkpoint.projection_revision ?? null,
    available: available.value,
    configuredLeverage: configuredLeverage.value,
    venueAvailableToTrade: venueCapacity.value?.availableToTrade ?? null,
    venueMaximumBaseQuantity: venueCapacity.value?.maximumBaseQuantity ?? null,
    venueEffectiveLeverage: venueCapacity.value?.effectiveLeverage ?? null,
  }),
)
const planFingerprint = computed(() => {
  const planned = preview.value
  if (planned === null) return null
  return [planned.symbol, planned.position_side, planned.normalized_base_quantity].join(':')
})
const affordabilityConfirmationRequired = computed(
  () =>
    affordability.value?.state === 'insufficient_margin_likely' &&
    acceptedPlanFingerprint.value !== planFingerprint.value,
)
const submitReady = computed(() => ready.value && !affordabilityConfirmationRequired.value)
const remediation = computed(() =>
  error.value === null ? null : previewRejectionRemediation(error.value, props.accountId),
)
let capacityGeneration = 0
let capacityAbort: AbortController | null = null
let ownerForm: HTMLFormElement | null = null
const affordabilityTransitions = new AffordabilityTransitionTracker()

const sourceLabel = computed(() => {
  switch (preview.value?.price_source) {
    case 'best_bid':
      return 'best bid'
    case 'best_ask':
      return 'best ask'
    case 'limit':
      return 'limit'
    case 'trailing_entry_reference':
      return 'activation jump reference'
    case 'adverse_entry_execution_bound':
      return 'adverse entry bound'
    default:
      return ''
  }
})

watch(
  () => [
    preview.value?.symbol,
    preview.value?.position_side,
    account.value?.network,
    account.value?.exchange_metadata?.user_address,
    account.value?.exchange_metadata?.vault_address,
  ],
  scheduleCapacity,
)
watch(submitReady, (value) => emit('update:ready', value), { immediate: true })
watch(status, (value) => emit('update:status', value), { immediate: true })
watch(
  () => [props.actionAttemptId, affordability.value?.state ?? null] as const,
  ([actionAttemptId, state]) => {
    const advisory = affordability.value
    const transition = affordabilityTransitions.observe(actionAttemptId, state)
    if (transition === null || advisory === null) return
    recordTelemetry({
      eventName: 'affordability_changed',
      accountId: props.accountId,
      projectionRevision: advisory.projectionRevision,
      actionAttemptId: props.actionAttemptId,
      properties: {
        state: transition.state,
        previous_state: transition.previousState,
        source: 'execution_preview',
      },
    })
  },
)

function scheduleCapacity(): void {
  const current = ++capacityGeneration
  capacityAbort?.abort()
  capacityAbort = null
  venueCapacity.value = null
  const planned = preview.value
  const selected = account.value
  const userAddress = selected?.exchange_metadata?.user_address
  if (
    planned === null ||
    selected?.exchange !== ExchangeType.Hyperliquid ||
    !userAddress
  ) {
    return
  }
  const controller = new AbortController()
  capacityAbort = controller
  const timeout = window.setTimeout(() => controller.abort(), 5_000)
  void loadHyperliquidCapacity({
    network: selected.network,
    userAddress,
    vaultAddress: selected.exchange_metadata?.vault_address,
    symbol: planned.symbol,
    positionSide: planned.position_side,
    signal: controller.signal,
  })
    .then((capacity) => {
      if (current === capacityGeneration) venueCapacity.value = capacity
    })
    .catch(() => {
      // Venue advice is fail-open; projection evidence remains available.
    })
    .finally(() => {
      window.clearTimeout(timeout)
      if (current === capacityGeneration) capacityAbort = null
    })
}

function acceptAffordabilityRisk(): void {
  const fingerprint = planFingerprint.value
  if (fingerprint === null) return
  acceptedPlanFingerprint.value = fingerprint
  recordTelemetry({
    eventName: 'submit_anyway_selected',
    accountId: props.accountId,
    projectionRevision: affordability.value?.projectionRevision,
    actionAttemptId: props.actionAttemptId,
    properties: {
      blocker_code: 'INSUFFICIENT_MARGIN_LIKELY',
      source: affordability.value?.evidenceSource ?? 'unknown',
    },
  })
}

function refreshEditing(): void {
  const active = document.activeElement
  editing.value = ownerForm !== null && active !== null && ownerForm.contains(active) && isEditor(active)
}

onMounted(() => {
  ownerForm = previewRoot.value?.closest('form') ?? null
  ownerForm?.addEventListener('focusin', refreshEditing)
  ownerForm?.addEventListener('focusout', deferEditingRefresh)
  refreshEditing()
})

onBeforeUnmount(() => {
  ownerForm?.removeEventListener('focusin', refreshEditing)
  ownerForm?.removeEventListener('focusout', deferEditingRefresh)
  capacityGeneration += 1
  capacityAbort?.abort()
  affordabilityTransitions.clear()
})

function deferEditingRefresh(): void {
  queueMicrotask(refreshEditing)
}

function isEditor(target: Element): boolean {
  return target.matches('input, select, textarea, [contenteditable="true"]')
}
</script>

<template>
  <section
    ref="previewRoot"
    class="execution-preview"
    :class="{ rejected: error !== null, compact: props.compact }"
  >
    <div class="preview-heading">
      <span>Execution Preview</span>
      <span v-if="pending">Planning…</span>
      <span v-else-if="guidance">Checking input…</span>
      <span v-else-if="error">Rejected</span>
      <span v-else-if="preview">Ready</span>
      <span v-else>Enter order details</span>
    </div>

    <p v-if="guidance" class="preview-guidance">{{ guidance }}</p>
    <div v-else-if="error && remediation" class="preview-remediation">
      <strong>{{ remediation.title }}</strong>
      <p>{{ remediation.description }}</p>
      <RouterLink :to="remediation.actionPath" class="preview-action">
        {{ remediation.actionLabel }}
      </RouterLink>
      <details class="preview-technical">
        <summary>Technical detail</summary>
        <p class="preview-error">{{ error }}</p>
      </details>
    </div>
    <p v-else-if="error" class="preview-error">{{ error }}</p>
    <template v-else-if="preview">
      <div class="preview-grid">
        <span>{{
          props.quoteAsset ? 'Decision price (' + props.quoteAsset + ')' : 'Decision price'
        }}</span>
        <strong>{{ preview.decision_price }} · {{ sourceLabel }}</strong>
        <span>Normalized base</span>
        <strong>{{ preview.normalized_base_quantity }} {{ preview.symbol }}</strong>
        <span>{{
          props.quoteAsset ? 'Estimated notional (' + props.quoteAsset + ')' : 'Estimated notional'
        }}</span>
        <strong>{{ preview.normalized_quote_notional }}</strong>
        <span>Exchange children</span>
        <strong>{{ preview.children.length }}</strong>
      </div>

      <p v-if="preview.raw_base_quantity !== preview.normalized_base_quantity" class="preview-note">
        Requested calculation: {{ preview.raw_base_quantity }} base
      </p>
      <div v-if="preview.fee_risk" class="fee-risk-panel">
        <strong>Planned all-in risk at stop · {{ quoteAsset ?? 'USDC' }}</strong>
        <div class="preview-grid rule-grid">
          <span>Requested risk</span><strong>{{ preview.fee_risk.requested_risk }}</strong>
          <span>Price loss at stop</span><strong>{{ preview.fee_risk.planned_price_loss }}</strong>
          <span>Expected entry fee</span><strong>{{ preview.fee_risk.expected_entry_fee }}</strong>
          <span>Expected stop-exit fee</span
          ><strong>{{ preview.fee_risk.expected_stop_exit_fee }}</strong>
          <span>Total planned loss</span
          ><strong>{{ preview.fee_risk.total_planned_loss }}</strong>
        </div>
        <p class="preview-note">
          Uses recorded fee policy v{{ preview.fee_risk.policy_version }}. Stop-market slippage,
          gaps, funding, and later venue fee changes are not guaranteed by this estimate.
        </p>
      </div>
      <details v-if="preview.children.length > 1" class="preview-details">
        <summary>Child allocations</summary>
        <div v-for="(child, index) in preview.children" :key="index" class="child-row">
          <span>#{{ index + 1 }}</span>
          <span>
            {{ child.base_quantity }} {{ preview.symbol }} · {{ child.quote_notional }}
            {{ props.quoteAsset ?? '' }}
          </span>
        </div>
      </details>
      <details class="preview-details">
        <summary>Exchange rules</summary>
        <div class="preview-grid rule-grid">
          <span>Quantity step</span><strong>{{ preview.instrument.quantity_step }}</strong>
          <template v-if="preview.instrument.price.kind === 'fixed_tick'">
            <span>Price tick</span><strong>{{ preview.instrument.price.tick }}</strong>
          </template>
          <template v-else>
            <span>Price precision</span>
            <strong>
              Hyperliquid · size decimals {{ preview.instrument.price.size_decimals }}
            </strong>
          </template>
          <span>Minimum quantity</span
          ><strong>{{ preview.instrument.minimum_order_quantity }}</strong>
          <span v-if="preview.instrument.maximum_order_quantity">Maximum quantity</span>
          <strong v-if="preview.instrument.maximum_order_quantity">
            {{ preview.instrument.maximum_order_quantity }}
          </strong>
          <span v-if="preview.instrument.minimum_order_notional">
            {{
              props.quoteAsset ? 'Minimum notional (' + props.quoteAsset + ')' : 'Minimum notional'
            }}
          </span>
          <strong v-if="preview.instrument.minimum_order_notional">
            {{ preview.instrument.minimum_order_notional }}
          </strong>
        </div>
      </details>
      <p v-for="warning in preview.warnings" :key="warning" class="preview-warning">
        {{ warning }}
      </p>
      <div
        v-if="affordability?.state === 'insufficient_margin_likely'"
        class="affordability-warning"
        role="status"
      >
        <strong>Likely above available margin</strong>
        <span>
          <template v-if="affordability.evidenceSource === 'venue_capacity'">
            Planned {{ formatExactDecimal(preview.normalized_base_quantity) }}
            {{ preview.symbol }}; Hyperliquid currently reports a
            {{ formatExactDecimal(affordability.maximumBaseQuantity ?? '0') }}
            {{ preview.symbol }} maximum for this side and
            {{ formatExactDecimal(affordability.available ?? '0') }} available to trade.
          </template>
          <template v-else>
            Planned {{ formatExactDecimal(preview.normalized_quote_notional) }}
            {{ props.quoteAsset ?? '' }}; the latest synced
            {{ formatExactDecimal(affordability.available ?? '0') }} available at
            {{ affordability.leverage }}x supports about
            {{ formatExactDecimal(affordability.estimatedMaximumNotional ?? '0') }} notional.
          </template>
          Hyperliquid may partially fill or reject the order.
        </span>
        <small>
          This evidence is advisory and Hyperliquid remains the final authority.
        </small>
        <button
          v-if="affordabilityConfirmationRequired"
          type="button"
          class="preview-action affordability-accept"
          @click="acceptAffordabilityRisk"
        >
          Submit anyway
        </button>
        <small v-else>Margin warning acknowledged for this exact planned size.</small>
      </div>
      <p class="preview-note">Final submission replans against current exchange evidence.</p>
    </template>
  </section>
</template>

<style scoped>
.execution-preview {
  border: 1px solid var(--border-color);
  background: var(--color-panel);
  padding: 10px;
}
.execution-preview.rejected {
  border-color: var(--color-error);
}
.preview-heading,
.preview-grid,
.child-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.preview-heading {
  color: var(--color-text-dim);
  text-transform: uppercase;
}
.preview-grid {
  margin-top: 8px;
}
.preview-grid strong,
.child-row span:last-child {
  text-align: right;
  font-weight: 400;
  font-family: var(--font-mono);
}
.preview-details {
  margin-top: 8px;
}

.fee-risk-panel {
  border: 1px solid var(--border-color);
  margin-top: 0.65rem;
  padding: 0.65rem;
}
.child-row {
  padding-top: 4px;
  color: var(--color-text-dim);
}
.rule-grid {
  padding-left: 8px;
}
.preview-error,
.preview-warning,
.preview-note {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
}
.preview-error {
  color: var(--color-error);
}
.preview-guidance {
  margin: 8px 0 0;
  color: var(--color-text-dim);
  overflow-wrap: anywhere;
}
.preview-remediation {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.65rem;
  color: var(--color-text);
}
.preview-remediation strong {
  color: var(--color-warning);
  font-size: 12px;
  font-weight: 600;
}
.preview-remediation p {
  margin: 0;
  line-height: 1.45;
}
.preview-action {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 30px;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--state-warning);
  color: #0b0f14;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  background: var(--state-warning);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--state-warning) 45%, transparent);
  animation: approval-cta-pulse 1.6s ease-out infinite;
}
.preview-action:hover,
.preview-action:focus-visible {
  color: #0b0f14;
  background: color-mix(in srgb, var(--state-warning) 82%, white);
  animation-play-state: paused;
}
.preview-technical {
  color: var(--color-text-dim);
  font-size: 10px;
}
.preview-technical .preview-error {
  margin-top: 0.4rem;
}
@keyframes approval-cta-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--state-warning) 42%, transparent);
  }
  55% {
    box-shadow: 0 0 0 5px transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  .preview-action {
    animation: none;
  }
}
.preview-warning {
  color: var(--color-warning);
}
.affordability-warning {
  display: grid;
  gap: 0.3rem;
  margin-top: 8px;
  padding: 0.55rem;
  border: 1px solid var(--state-warning);
  color: var(--color-warning);
  background: color-mix(in srgb, var(--state-warning) 8%, transparent);
}
.affordability-warning strong,
.affordability-warning small {
  display: block;
}
.affordability-accept {
  justify-self: start;
}
.affordability-warning small {
  color: var(--color-text-dim);
}
.preview-note {
  color: var(--color-text-dim);
}
.execution-preview.compact {
  padding: 0.65rem;
  background: var(--surface-sunken);
}
.execution-preview.compact .preview-heading,
.execution-preview.compact .preview-grid {
  font-size: 10px;
}
.execution-preview.compact .preview-details,
.execution-preview.compact .preview-note {
  font-size: 10px;
}
</style>
