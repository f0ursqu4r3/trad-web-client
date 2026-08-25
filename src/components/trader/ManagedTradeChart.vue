<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LineChart } from 'lucide-vue-next'

import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import TrailingEntryChart from '@/components/engine/TrailingEntryChart.vue'
import PanelEmptyState from '@/components/general/PanelEmptyState.vue'
import {
  chartDecimal,
  jumpBasisPointsForPrice,
  type TrailingEntryLineId,
} from '@/lib/chart/trailingEntryChart'
import {
  lifecycleActions,
  type LifecycleAction,
  type TrailingEntryAmendmentDraft,
} from '@/lib/engineCommands/lifecycle'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import { nodeKey } from '@/lib/projection'
import { projectionEntities } from '@/lib/projection/presentation'
import { managedTradeTrailingEntries } from '@/lib/projection/tradeWorkspaceCharts'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { useAccountsStore } from '@/stores/accounts'

const props = withDefaults(
  defineProps<{
    trade: ManagedTradeView
    snapshot: BrowserAccountSnapshot
    compact?: boolean
    editable?: boolean
  }>(),
  { compact: false, editable: true },
)

const accounts = useAccountsStore()
const selectedId = ref<string | null>(null)
const editAction = ref<LifecycleAction | null>(null)
const amendment = ref<Partial<TrailingEntryAmendmentDraft> | null>(null)
const entries = computed(() => managedTradeTrailingEntries(props.trade, props.snapshot))
const selected = computed(
  () =>
    entries.value.find((entry) => entry.trailing_entry_id === selectedId.value) ??
    entries.value[0] ??
    null,
)

watch(
  entries,
  (next) => {
    if (!next.some((entry) => entry.trailing_entry_id === selectedId.value)) {
      selectedId.value = next[0]?.trailing_entry_id ?? null
    }
  },
  { immediate: true },
)

function editLine(line: TrailingEntryLineId, price: number): void {
  const entry = selected.value
  if (!props.editable || entry === null) return
  const entity = projectionEntities(props.snapshot).get(
    nodeKey({ kind: 'trailing_entry', id: entry.trailing_entry_id }),
  )
  const action = lifecycleActions(entity ?? null, props.snapshot, props.snapshot.positions).find(
    (candidate) => candidate.kind === 'amend_trailing_entry',
  )
  if (action === undefined) return

  const value = chartDecimal(price)
  if (line === 'activation_price') amendment.value = { activationPrice: value }
  if (line === 'stop_loss') amendment.value = { stopLossPrice: value }
  if (line === 'take_profit') amendment.value = { takeProfitMode: 'set', takeProfitPrice: value }
  if (line === 'jump_trigger' && entry.peak !== null) {
    amendment.value = {
      jumpBasisPoints: jumpBasisPointsForPrice(entry.plan.position_side, Number(entry.peak), price),
    }
  }
  if (line === 'peak_price' || amendment.value === null) return
  editAction.value = action
}

function closeEdit(): void {
  editAction.value = null
  amendment.value = null
}
</script>

<template>
  <section class="managed-trade-chart" :class="{ compact }" data-testid="managed-trade-chart">
    <div v-if="entries.length > 1 && !compact" class="chart-source-bar">
      <span>Chart source</span>
      <button
        v-for="entry in entries"
        :key="entry.trailing_entry_id"
        class="btn btn-xs"
        type="button"
        :aria-pressed="selected?.trailing_entry_id === entry.trailing_entry_id"
        @click="selectedId = entry.trailing_entry_id"
      >
        {{ entry.phase }} · #{{ entry.trailing_entry_id.slice(0, 8) }}
      </button>
    </div>
    <TrailingEntryChart
      v-if="selected"
      :account-id="accounts.selectedAccountId ?? ''"
      :trailing-entry="selected"
      :compact="compact"
      :interactive="editable && !compact"
      @edit-line="editLine"
    />
    <PanelEmptyState
      v-else-if="!compact"
      title="No strategy chart"
      description="This trade has no price-history strategy device to chart. Orders and fills remain available in the other tabs."
    >
      <template #icon><LineChart :size="18" /></template>
    </PanelEmptyState>
    <LifecycleActionModal
      :open="editAction !== null"
      :account-id="accounts.selectedAccountId ?? ''"
      :action="editAction"
      :initial-trailing-entry="amendment"
      @close="closeEdit"
    />
  </section>
</template>

<style scoped>
.managed-trade-chart {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  background: var(--chart-bg);
}
.chart-source-bar {
  display: flex;
  min-height: 36px;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  color: var(--fg-muted);
  background: var(--surface-sunken);
  border-bottom: 1px solid var(--border-normal);
}
.chart-source-bar > span {
  margin-right: 0.25rem;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.compact {
  min-height: 160px;
}
</style>
