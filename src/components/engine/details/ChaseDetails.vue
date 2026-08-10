<script setup lang="ts">
import { computed } from 'vue'

import type { ChaseProjection } from '@/lib/gateway'
import DetailGrid from './DetailGrid.vue'
import { compactDetails, detail, optionalDetail, recordDetail, yesNo } from './model'

const props = defineProps<{ chase: ChaseProjection }>()

const planRows = computed(() =>
  compactDetails([
    recordDetail('Symbol', props.chase.plan, 'symbol'),
    recordDetail('Position Side', props.chase.plan, 'position_side'),
    recordDetail('Quantity', props.chase.plan, 'quantity'),
    recordDetail('Mode', props.chase.plan, 'mode'),
    recordDetail('Remainder Policy', props.chase.plan, 'remainder_policy'),
    recordDetail('Expires At', props.chase.plan, 'expires_at'),
  ]),
)
const marketRows = computed(() =>
  compactDetails([
    optionalDetail('Desired Price', props.chase.desired_price),
    optionalDetail('Boundary Price', props.chase.resolved_boundary_price),
    optionalDetail('Best Bid', props.chase.latest_bid),
    optionalDetail('Best Ask', props.chase.latest_ask),
    optionalDetail('Market Generation', props.chase.market_generation),
    detail('Market Stale', yesNo(props.chase.market_stale)),
  ]),
)
const repriceRows = computed(() => [
  detail('Lifecycle', props.chase.lifecycle),
  detail('Order Started', yesNo(props.chase.order_started)),
  detail('Reprice Sequence', props.chase.reprice_sequence),
  detail('Reprice Ready', yesNo(props.chase.reprice_ready)),
  detail('Consecutive Failures', props.chase.consecutive_reprice_failures),
  detail('Post-only Retry', yesNo(props.chase.post_only_retry_pending)),
])
</script>

<template>
  <div data-testid="chase-details">
    <DetailGrid title="Chase Plan" :rows="planRows" />
    <DetailGrid title="Book State" :rows="marketRows" />
    <DetailGrid title="Repricing" :rows="repriceRows" />
    <div v-if="chase.last_reason" class="reason-block">
      <span>Last Reason</span>
      <span class="reason-value">{{ chase.last_reason }}</span>
    </div>
  </div>
</template>

<style scoped>
.reason-block {
  display: grid;
  gap: 4px;
  padding: 9px 12px;
  color: var(--color-text);
  border-bottom: 1px solid var(--border-color);
}

.reason-block span {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}

.reason-block .reason-value {
  color: var(--color-text);
  font-size: inherit;
  text-transform: none;
}
</style>
