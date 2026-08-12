<script setup lang="ts">
import { computed, ref } from 'vue'

import LifecycleActionModal from '@/components/engine/actions/LifecycleActionModal.vue'
import TrailingEntryChart from '@/components/engine/TrailingEntryChart.vue'
import {
  lifecycleActions,
  type LifecycleAction,
  type TrailingEntryAmendmentDraft,
} from '@/lib/engineCommands/lifecycle'
import {
  chartDecimal,
  jumpBasisPointsForPrice,
  type TrailingEntryLineId,
} from '@/lib/chart/trailingEntryChart'
import type { TrailingEntryProjection } from '@/lib/gateway'
import { useAccountsStore } from '@/stores/accounts'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useProjectionUiStore } from '@/stores/projectionUi'

const props = defineProps<{ trailingEntry: TrailingEntryProjection }>()
const accounts = useAccountsStore()
const projections = useAccountProjectionStore()
const ui = useProjectionUiStore()
const editAction = ref<LifecycleAction | null>(null)
const amendment = ref<Partial<TrailingEntryAmendmentDraft> | null>(null)

const accountId = computed(() => accounts.selectedAccountId ?? '')

function editLine(line: TrailingEntryLineId, price: number): void {
  const action = lifecycleActions(
    ui.selectedEntity,
    ui.graph,
    projections.selectedLive?.positions ?? [],
  ).find((candidate) => candidate.kind === 'amend_trailing_entry')
  if (action === undefined) return

  const value = chartDecimal(price)
  switch (line) {
    case 'activation_price':
      amendment.value = { activationPrice: value }
      break
    case 'stop_loss':
      amendment.value = { stopLossPrice: value }
      break
    case 'take_profit':
      amendment.value = { takeProfitMode: 'set', takeProfitPrice: value }
      break
    case 'jump_trigger':
      if (props.trailingEntry.peak === null) return
      amendment.value = {
        jumpBasisPoints: jumpBasisPointsForPrice(
          props.trailingEntry.plan.position_side,
          Number(props.trailingEntry.peak),
          price,
        ),
      }
      break
    case 'peak_price':
      return
  }
  editAction.value = action
}

function closeEdit(): void {
  editAction.value = null
  amendment.value = null
}
</script>

<template>
  <section class="te-workspace" data-testid="engine-te-workspace">
    <TrailingEntryChart
      :account-id="accountId"
      :trailing-entry="trailingEntry"
      @edit-line="editLine"
    />
    <LifecycleActionModal
      :open="editAction !== null"
      :account-id="accountId"
      :action="editAction"
      :initial-trailing-entry="amendment"
      @close="closeEdit"
    />
  </section>
</template>

<style scoped>
.te-workspace {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}
</style>
