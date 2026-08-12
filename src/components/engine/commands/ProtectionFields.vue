<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'

import {
  newTakeProfit,
  type ProtectionFormState,
  type TakeProfitFormState,
} from '@/lib/engineCommands/form'
import { labelWithUnit } from '@/lib/engineCommands/marketUnits'

const model = defineModel<ProtectionFormState>({ required: true })
const props = defineProps<{
  markPriceOnly?: boolean
  baseAsset?: string | null
  quoteAsset?: string | null
}>()

function addTakeProfit(): void {
  if (model.value.takeProfits.length >= 20) return
  const row = newTakeProfit()
  if (model.value.takeProfits.length === 1) {
    const first = model.value.takeProfits[0]!
    if (first.allocationKind === 'full_remaining') {
      first.allocationKind = 'fraction'
      first.allocationValue = '50'
      row.allocationKind = 'fraction'
      row.allocationValue = '50'
    }
  } else if (model.value.takeProfits.length > 1) {
    row.allocationKind = 'fraction'
    row.allocationValue = ''
  }
  model.value.takeProfits.push(row)
}

function removeTakeProfit(row: TakeProfitFormState): void {
  model.value.takeProfits = model.value.takeProfits.filter((candidate) => candidate.id !== row.id)
}
</script>

<template>
  <section class="protection-fields">
    <div class="section-heading">
      <span>Attached Protection</span>
      <button
        class="btn btn-sm btn-ghost icon-label"
        type="button"
        :disabled="model.takeProfits.length >= 20"
        @click="addTakeProfit"
      >
        <Plus :size="12" /> Take Profit
      </button>
    </div>

    <div v-for="(takeProfit, index) in model.takeProfits" :key="takeProfit.id" class="tp-row">
      <div class="tp-fields">
        <label class="field">
          <span>{{ labelWithUnit('TP ' + (index + 1) + ' Trigger', props.quoteAsset) }}</span>
          <input
            v-model="takeProfit.triggerPrice"
            class="input"
            :aria-label="'TP ' + (index + 1) + ' Trigger'"
            :aria-description="props.quoteAsset ? 'Denominated in ' + props.quoteAsset : undefined"
            type="text"
            inputmode="decimal"
            placeholder="Price"
          />
        </label>
        <label class="field">
          <span>Allocation</span>
          <select v-model="takeProfit.allocationKind" class="input">
            <option value="full_remaining">Full Remaining</option>
            <option value="fraction">Percent</option>
            <option value="exact_base">Base Quantity</option>
          </select>
        </label>
        <label v-if="takeProfit.allocationKind !== 'full_remaining'" class="field">
          <span>{{
            takeProfit.allocationKind === 'fraction'
              ? 'Percent'
              : labelWithUnit('Base Quantity', props.baseAsset)
          }}</span>
          <input
            v-model="takeProfit.allocationValue"
            class="input"
            :aria-label="takeProfit.allocationKind === 'fraction' ? 'Percent' : 'Base Quantity'"
            type="text"
            inputmode="decimal"
          />
        </label>
        <label class="field">
          <span>Trigger Source</span>
          <span v-if="markPriceOnly" class="readonly-value">Mark Price</span>
          <select v-else v-model="takeProfit.triggerSource" class="input">
            <option value="mark_price">Mark Price</option>
            <option value="last_price">Last Price</option>
            <option value="index_price">Index Price</option>
          </select>
        </label>
        <label class="field">
          <span>Execution</span>
          <select v-model="takeProfit.executionKind" class="input">
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </label>
        <label v-if="takeProfit.executionKind === 'limit'" class="field">
          <span>{{ labelWithUnit('Limit Price', props.quoteAsset) }}</span>
          <input
            v-model="takeProfit.executionPrice"
            class="input"
            aria-label="Limit Price"
            type="text"
            inputmode="decimal"
          />
        </label>
      </div>
      <button
        class="btn icon-btn remove-button"
        type="button"
        title="Remove take profit"
        @click="removeTakeProfit(takeProfit)"
      >
        <Trash2 :size="12" />
      </button>
    </div>

    <label class="stop-toggle">
      <input v-model="model.stopLoss.enabled" type="checkbox" />
      Stop loss
    </label>
    <div v-if="model.stopLoss.enabled" class="stop-row">
      <label class="field">
        <span>{{ labelWithUnit('SL Trigger', props.quoteAsset) }}</span>
        <input
          v-model="model.stopLoss.triggerPrice"
          class="input"
          aria-label="SL Trigger"
          type="text"
          inputmode="decimal"
          placeholder="Price"
        />
      </label>
      <label class="field">
        <span>Trigger Source</span>
        <span v-if="markPriceOnly" class="readonly-value">Mark Price</span>
        <select v-else v-model="model.stopLoss.triggerSource" class="input">
          <option value="mark_price">Mark Price</option>
          <option value="last_price">Last Price</option>
          <option value="index_price">Index Price</option>
        </select>
      </label>
      <label class="field">
        <span>Execution</span>
        <select v-model="model.stopLoss.executionKind" class="input">
          <option value="market">Market</option>
          <option value="limit">Limit</option>
        </select>
      </label>
      <label v-if="model.stopLoss.executionKind === 'limit'" class="field">
        <span>{{ labelWithUnit('Limit Price', props.quoteAsset) }}</span>
        <input
          v-model="model.stopLoss.executionPrice"
          class="input"
          aria-label="Limit Price"
          type="text"
          inputmode="decimal"
        />
      </label>
    </div>
  </section>
</template>

<style scoped>
.protection-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.section-heading,
.stop-toggle,
.icon-label {
  display: flex;
  align-items: center;
}

.section-heading {
  justify-content: space-between;
  color: var(--color-text-dim);
  text-transform: uppercase;
}

.icon-label,
.stop-toggle {
  gap: 5px;
}

.tp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: end;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 65%, transparent);
}

.tp-fields,
.stop-row {
  display: grid;
  gap: 8px;
}

.tp-fields {
  grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
}

.stop-row {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.field {
  min-width: 0;
}

.field > .input,
.readonly-value {
  box-sizing: border-box;
  width: 100%;
}

.remove-button {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
}

.readonly-value {
  display: flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 7px;
  color: var(--color-text-dim);
  border: 1px solid var(--border-color);
}

@media (max-width: 760px) {
  .tp-fields,
  .stop-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .tp-fields,
  .stop-row {
    grid-template-columns: 1fr;
  }
}
</style>
