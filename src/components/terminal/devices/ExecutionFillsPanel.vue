<script setup lang="ts">
import { computed } from 'vue'
import type { ExecutionFill } from '@/lib/ws/protocol'
import { formatPrice, formatQty } from './utils'
import { formatTokenTotals, summarizeExecutionFills } from '@/lib/executionEconomics'

const props = defineProps<{
  fills: ExecutionFill[]
}>()

function decimal(value?: string | null): number | null {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDecimal(value: number, maximumFractionDigits = 8): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })
}

function formatFillPrice(value?: string | null): string {
  const parsed = decimal(value)
  return parsed == null ? '-' : `$${formatPrice(parsed)}`
}

function formatFillQuantity(value?: string | null): string {
  const parsed = decimal(value)
  return parsed == null ? '-' : formatQty(parsed)
}

const totalQuantity = computed(() =>
  props.fills.reduce((total, fill) => total + (decimal(fill.quantity) ?? 0), 0),
)

const totalNotional = computed(() =>
  props.fills.reduce(
    (total, fill) => total + (decimal(fill.price) ?? 0) * (decimal(fill.quantity) ?? 0),
    0,
  ),
)

const averageFillPrice = computed(() => {
  if (totalQuantity.value <= 0) return null
  return totalNotional.value / totalQuantity.value
})

const economics = computed(() => summarizeExecutionFills(props.fills))

function liquidity(fill: ExecutionFill): string {
  if (fill.is_maker === true) return 'Maker'
  if (fill.is_maker === false) return 'Taker'
  return '-'
}

function fillTime(fill: ExecutionFill): string {
  if (fill.execution_time_ms == null) return '-'
  return new Date(fill.execution_time_ms).toLocaleString()
}

function shortId(value?: string | null): string {
  if (!value) return '-'
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value
}
</script>

<template>
  <div v-if="fills.length" class="space-y-3">
    <h4 class="section-title">Execution</h4>
    <div data-testid="execution-fill-summary" class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
      <div>
        <dt class="dt-label">Average Fill</dt>
        <dd class="m-0 font-mono text-primary">
          {{ averageFillPrice == null ? '-' : `$${formatPrice(averageFillPrice)}` }}
        </dd>
      </div>
      <div>
        <dt class="dt-label">Filled Notional</dt>
        <dd class="m-0 font-mono text-primary">${{ formatDecimal(totalNotional, 2) }}</dd>
      </div>
      <div>
        <dt class="dt-label">Total Fee</dt>
        <dd class="m-0 font-mono text-primary">
          {{ formatTokenTotals(economics.totalFees) }}
        </dd>
      </div>
      <div>
        <dt class="dt-label">Builder Component</dt>
        <dd class="m-0 font-mono text-primary">
          {{ formatTokenTotals(economics.builderFees) }}
        </dd>
      </div>
      <div>
        <dt class="dt-label">Exchange Component</dt>
        <dd class="m-0 font-mono text-primary">
          {{ formatTokenTotals(economics.exchangeFees) }}
        </dd>
      </div>
      <div>
        <dt class="dt-label">Reported Closed PnL</dt>
        <dd class="m-0 font-mono text-primary">
          {{ formatTokenTotals(economics.closedPnl) }}
        </dd>
      </div>
    </div>

    <details class="border-t border-[var(--border-color)] pt-2">
      <summary class="cursor-pointer text-[11px] font-mono text-primary">
        Fills ({{ fills.length }})
      </summary>
      <div
        data-testid="execution-fill-list"
        class="mt-2 max-h-72 overflow-auto divide-y divide-[var(--border-color)]"
      >
        <div
          v-for="(fill, index) in fills"
          :key="fill.execution_id || `${fill.remote_order_id}-${fill.execution_time_ms}-${index}`"
          class="grid grid-cols-2 gap-x-4 gap-y-1 py-2 text-[11px]"
        >
          <div>
            <dt class="dt-label">Price</dt>
            <dd class="m-0 font-mono text-primary">
              {{ formatFillPrice(fill.price) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Quantity</dt>
            <dd class="m-0 font-mono text-primary">
              {{ formatFillQuantity(fill.quantity) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Direction</dt>
            <dd class="m-0 font-mono text-primary">{{ fill.direction || fill.side || '-' }}</dd>
          </div>
          <div>
            <dt class="dt-label">Liquidity</dt>
            <dd class="m-0 font-mono text-primary">{{ liquidity(fill) }}</dd>
          </div>
          <div>
            <dt class="dt-label">Total Fee</dt>
            <dd class="m-0 font-mono text-primary">
              {{ fill.fee || '-' }} {{ fill.fee ? fill.fee_token || 'quote' : '' }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Builder Fee</dt>
            <dd class="m-0 font-mono text-primary">
              {{ fill.builder_fee || '-' }}
              {{ fill.builder_fee ? fill.fee_token || 'quote' : '' }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Closed PnL</dt>
            <dd class="m-0 font-mono text-primary">
              {{ fill.closed_pnl || '-' }}
              {{ fill.closed_pnl ? fill.fee_token || 'quote' : '' }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Start Position</dt>
            <dd class="m-0 font-mono text-primary">
              {{ fill.start_position || '-' }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Time</dt>
            <dd class="m-0 font-mono text-primary">{{ fillTime(fill) }}</dd>
          </div>
          <div>
            <dt class="dt-label">Trade ID</dt>
            <dd class="m-0 font-mono text-primary" :title="fill.execution_id || undefined">
              {{ shortId(fill.execution_id) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Order ID</dt>
            <dd class="m-0 font-mono text-primary" :title="fill.remote_order_id || undefined">
              {{ shortId(fill.remote_order_id) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Client Order ID</dt>
            <dd class="m-0 font-mono text-primary" :title="fill.client_order_id || undefined">
              {{ shortId(fill.client_order_id) }}
            </dd>
          </div>
          <div>
            <dt class="dt-label">Transaction Hash</dt>
            <dd class="m-0 font-mono text-primary" :title="fill.transaction_hash || undefined">
              {{ shortId(fill.transaction_hash) }}
            </dd>
          </div>
        </div>
      </div>
    </details>
  </div>
</template>
