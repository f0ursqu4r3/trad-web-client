<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'

import FormField from '@/components/forms/FormField.vue'
import { newTakeProfit } from '@/lib/engineCommands/form'
import { labelWithUnit, type MarketUnits } from '@/lib/engineCommands/marketUnits'
import type { TradeTicketDraft } from '@/lib/trader/tradeTicketDraft'

defineProps<{ units: MarketUnits }>()
const draft = defineModel<TradeTicketDraft>({ required: true })

function addTakeProfit(): void {
  if (draft.value.protection.takeProfits.length >= (draft.value.entryType === 'trailing' ? 1 : 20))
    return
  const row = newTakeProfit()
  const existing = draft.value.protection.takeProfits
  if (existing.length === 1 && existing[0]?.allocationKind === 'full_remaining') {
    existing[0].allocationKind = 'fraction'
    existing[0].allocationValue = '50'
    row.allocationKind = 'fraction'
    row.allocationValue = '50'
  }
  existing.push(row)
}

function removeTakeProfit(id: string): void {
  draft.value.protection.takeProfits = draft.value.protection.takeProfits.filter(
    (row) => row.id !== id,
  )
}
</script>

<template>
  <section class="ticket-protection">
    <div class="protection-heading">
      <div>
        <span>Position protection</span>
        <small>SL is stop market · TP is resting limit</small>
      </div>
      <button
        class="btn btn-sm btn-ghost"
        type="button"
        :disabled="draft.entryType === 'trailing' && draft.protection.takeProfits.length >= 1"
        @click="addTakeProfit"
      >
        <Plus :size="11" /> Add TP
      </button>
    </div>

    <label class="stop-toggle">
      <input v-model="draft.protection.stopLoss.enabled" type="checkbox" />
      Protective stop market <span>recommended</span>
    </label>
    <FormField
      v-if="draft.protection.stopLoss.enabled"
      :label="labelWithUnit('Stop-loss price', units.quote)"
      help="Triggers a reduce-only market exit sized only to this Trad-managed exposure."
      required
    >
      <input
        v-model="draft.protection.stopLoss.triggerPrice"
        class="input"
        :class="{
          'input-required-empty': draft.protection.stopLoss.triggerPrice.trim() === '',
        }"
        inputmode="decimal"
        placeholder="Required"
        required
      />
    </FormField>

    <div
      v-for="(takeProfit, index) in draft.protection.takeProfits"
      :key="takeProfit.id"
      class="tp-row"
    >
      <FormField
        :label="labelWithUnit(`Take-profit ${index + 1}`, units.quote)"
        help="A plain reduce-only limit order for this managed exposure."
        required
      >
        <input
          v-model="takeProfit.triggerPrice"
          class="input"
          :class="{ 'input-required-empty': takeProfit.triggerPrice.trim() === '' }"
          inputmode="decimal"
          placeholder="Required"
          required
        />
      </FormField>
      <FormField v-if="draft.entryType !== 'trailing'" label="Close amount" required>
        <select v-model="takeProfit.allocationKind" class="input">
          <option value="full_remaining">Full remainder</option>
          <option value="fraction">Percent</option>
          <option value="exact_base">Base quantity</option>
        </select>
      </FormField>
      <FormField
        v-if="draft.entryType !== 'trailing' && takeProfit.allocationKind !== 'full_remaining'"
        :label="takeProfit.allocationKind === 'fraction' ? 'Percent' : 'Base quantity'"
        required
      >
        <input
          v-model="takeProfit.allocationValue"
          class="input"
          :class="{ 'input-required-empty': takeProfit.allocationValue.trim() === '' }"
          inputmode="decimal"
          placeholder="Required"
          required
        />
      </FormField>
      <button
        class="btn icon-btn remove-tp"
        type="button"
        title="Remove take profit"
        @click="removeTakeProfit(takeProfit.id)"
      >
        <Trash2 :size="12" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.ticket-protection {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-normal);
}
.protection-heading,
.stop-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.protection-heading > div {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}
.protection-heading span {
  color: var(--fg);
  font-size: 11px;
  text-transform: uppercase;
}
.protection-heading small {
  color: var(--fg-muted);
  font-size: 10px;
}
.stop-toggle {
  justify-content: flex-start;
  color: var(--fg-muted);
  font-size: 11px;
}
.stop-toggle span {
  color: var(--state-success);
  font-size: 9px;
  text-transform: uppercase;
}
.tp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(105px, 0.7fr) 28px;
  align-items: end;
  gap: 0.45rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border-subtle);
}
.tp-row > :nth-child(3):not(.remove-tp) {
  grid-column: 1 / 3;
}
.remove-tp {
  align-self: end;
}
@media (max-width: 520px) {
  .tp-row {
    grid-template-columns: 1fr 28px;
  }
  .tp-row > :not(.remove-tp) {
    grid-column: 1;
  }
  .remove-tp {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
