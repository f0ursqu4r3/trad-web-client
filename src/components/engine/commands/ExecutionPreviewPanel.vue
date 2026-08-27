<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { formatExactDecimal } from '@/lib/exactDecimalMath'
import { affordabilityAdvisory } from '@/lib/engineCommands/affordability'
import type { BrowserPreviewIntent, CommandPreview } from '@/lib/gateway'
import { previewRejectionRemediation } from '@/lib/engineCommands/previewRemediation'
import { recordTelemetry } from '@/lib/telemetry'
import { ExchangeType } from '@/lib/ws/protocol'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const props = defineProps<{
  accountId: string
  intent: BrowserPreviewIntent | null
  active: boolean
  quoteAsset?: string | null
  compact?: boolean
  actionAttemptId?: string | null
}>()
type PreviewStatus = 'idle' | 'planning' | 'ready' | 'rejected'

const emit = defineEmits<{
  (event: 'update:ready', ready: boolean): void
  (event: 'update:status', status: PreviewStatus): void
}>()

const gateway = useGatewayStore()
const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const preview = ref<CommandPreview | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)
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
  }),
)
const ready = computed(() => preview.value !== null && error.value === null && !pending.value)
const status = computed<PreviewStatus>(() => {
  if (pending.value) return 'planning'
  if (error.value !== null) return 'rejected'
  if (preview.value !== null) return 'ready'
  return 'idle'
})
const remediation = computed(() =>
  error.value === null ? null : previewRejectionRemediation(error.value, props.accountId),
)
let timer: number | null = null
let generation = 0

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
    default:
      return ''
  }
})

watch([() => props.active, () => props.accountId, () => props.intent], schedule, {
  deep: true,
  immediate: true,
})
watch(ready, (value) => emit('update:ready', value), { immediate: true })
watch(status, (value) => emit('update:status', value), { immediate: true })
watch(
  () => affordability.value?.fingerprint ?? null,
  (fingerprint, previous) => {
    const advisory = affordability.value
    if (fingerprint === null || advisory === null) return
    recordTelemetry({
      eventName: 'affordability_changed',
      accountId: props.accountId,
      projectionRevision: advisory.projectionRevision,
      actionAttemptId: props.actionAttemptId,
      properties: {
        state: advisory.state,
        previous_state: previous?.split(':', 1)[0] ?? 'unknown',
        source: 'execution_preview',
      },
    })
  },
)

function schedule(): void {
  if (timer !== null) window.clearTimeout(timer)
  const current = ++generation
  preview.value = null
  error.value = null
  pending.value = false
  if (!props.active || props.accountId === '' || props.intent === null || !gateway.isConnected)
    return
  timer = window.setTimeout(() => void request(current), 350)
}

async function request(current: number): Promise<void> {
  timer = null
  if (current !== generation || props.intent === null) return
  pending.value = true
  try {
    const outcome = await gateway.previewCommand(
      props.intent,
      props.accountId,
      undefined,
      props.actionAttemptId ?? undefined,
    )
    if (current !== generation) return
    if (outcome.kind === 'ready') preview.value = outcome.preview
    else error.value = outcome.rejection.reason
  } catch (reason) {
    if (current === generation)
      error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (current === generation) pending.value = false
  }
}

onBeforeUnmount(() => {
  generation += 1
  if (timer !== null) window.clearTimeout(timer)
})
</script>

<template>
  <section class="execution-preview" :class="{ rejected: error !== null, compact: props.compact }">
    <div class="preview-heading">
      <span>Execution Preview</span>
      <span v-if="pending">Planning…</span>
      <span v-else-if="error">Rejected</span>
      <span v-else-if="preview">Ready</span>
      <span v-else>Enter order details</span>
    </div>

    <div v-if="error && remediation" class="preview-remediation">
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
          Planned {{ formatExactDecimal(preview.normalized_quote_notional) }}
          {{ props.quoteAsset ?? '' }}; the latest synced
          {{ formatExactDecimal(affordability.available ?? '0') }} available at
          {{ affordability.leverage }}x supports about
          {{ formatExactDecimal(affordability.estimatedMaximumNotional ?? '0') }} notional.
          Hyperliquid may partially fill or reject the order.
        </span>
        <small>
          This is advisory only. Submission remains available and the venue is the final authority.
        </small>
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
