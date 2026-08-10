<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { BrowserPreviewIntent, CommandPreview } from '@/lib/gateway'
import { useGatewayStore } from '@/stores/gateway'

const props = defineProps<{
  accountId: string
  intent: BrowserPreviewIntent | null
  active: boolean
}>()

const gateway = useGatewayStore()
const preview = ref<CommandPreview | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)
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
    const outcome = await gateway.previewCommand(props.intent, props.accountId)
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
  <section class="execution-preview" :class="{ rejected: error !== null }">
    <div class="preview-heading">
      <span>Execution Preview</span>
      <span v-if="pending">Planning…</span>
      <span v-else-if="error">Rejected</span>
      <span v-else-if="preview">Ready</span>
      <span v-else>Enter order details</span>
    </div>

    <p v-if="error" class="preview-error">{{ error }}</p>
    <template v-else-if="preview">
      <div class="preview-grid">
        <span>Decision price</span>
        <strong>{{ preview.decision_price }} · {{ sourceLabel }}</strong>
        <span>Normalized base</span>
        <strong>{{ preview.normalized_base_quantity }} {{ preview.symbol }}</strong>
        <span>Estimated notional</span>
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
          <span>{{ child.base_quantity }} · {{ child.quote_notional }}</span>
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
          <span v-if="preview.instrument.minimum_order_notional">Minimum notional</span>
          <strong v-if="preview.instrument.minimum_order_notional">
            {{ preview.instrument.minimum_order_notional }}
          </strong>
        </div>
      </details>
      <p v-for="warning in preview.warnings" :key="warning" class="preview-warning">
        {{ warning }}
      </p>
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
.preview-warning {
  color: var(--color-warning);
}
.preview-note {
  color: var(--color-text-dim);
}
</style>
