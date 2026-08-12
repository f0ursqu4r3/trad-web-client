<script setup lang="ts">
import { computed } from 'vue'

import type { TrailingEntryProjection } from '@/lib/gateway'
import DetailGrid from './DetailGrid.vue'
import { compactDetails, detail, formatTimestamp, optionalDetail, yesNo } from './model'

const props = defineProps<{ trailingEntry: TrailingEntryProjection }>()

const planRows = computed(() =>
  compactDetails([
    detail('Symbol', props.trailingEntry.plan.symbol),
    detail('Position Side', props.trailingEntry.plan.position_side),
    detail('Activation Price', props.trailingEntry.plan.activation_price),
    detail('Jump Threshold (bps)', props.trailingEntry.plan.jump_threshold),
    detail('Stop Loss', props.trailingEntry.plan.stop_loss),
    optionalDetail('Take Profit', props.trailingEntry.plan.take_profit ?? null),
    detail('Risk Amount', props.trailingEntry.plan.risk_amount),
  ]),
)
const stateRows = computed(() =>
  compactDetails([
    detail('Phase', props.trailingEntry.phase),
    detail('Lifecycle', props.trailingEntry.lifecycle),
    detail('State Revision', props.trailingEntry.state_revision),
    detail('Points', props.trailingEntry.point_count),
    optionalDetail('Actual Activation', props.trailingEntry.actual_activation_price),
    optionalDetail('Activation Point', props.trailingEntry.activation_point_index),
    optionalDetail('Peak', props.trailingEntry.peak),
    optionalDetail('Peak Point', props.trailingEntry.peak_point_index),
  ]),
)
const marketRows = computed(() =>
  compactDetails([
    detail('Market Stale', yesNo(props.trailingEntry.market_stale)),
    optionalDetail('Market Generation', props.trailingEntry.market_generation),
    optionalDetail(
      'Last Trade Seen',
      props.trailingEntry.latest_trade_received_at === null
        ? null
        : formatTimestamp(props.trailingEntry.latest_trade_received_at),
    ),
    detail('Entry Cancel Requested', yesNo(props.trailingEntry.entry_cancel_requested)),
    detail('Continuations', props.trailingEntry.continuations.length),
    optionalDetail('Close Workflow', props.trailingEntry.close_workflow_id),
  ]),
)
</script>

<template>
  <div data-testid="trailing-entry-details">
    <DetailGrid title="Trailing Entry Plan" :rows="planRows" />
    <DetailGrid title="Current State" :rows="stateRows" />
    <DetailGrid title="Market and Control" :rows="marketRows" />
    <div v-if="trailingEntry.last_reason" class="reason-block">
      <span>Last Reason</span>
      <span class="reason-value">{{ trailingEntry.last_reason }}</span>
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
