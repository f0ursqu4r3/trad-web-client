<script setup lang="ts">
import { computed, ref } from 'vue'

import FormField from '@/components/forms/FormField.vue'
import { labelWithUnit, type MarketUnits } from '@/lib/engineCommands/marketUnits'
import type { TradeTicketDraft } from '@/lib/trader/tradeTicketDraft'

defineProps<{ units: MarketUnits }>()
const draft = defineModel<TradeTicketDraft>({ required: true })
const presetScale = ref<'standard' | 'test'>('standard')
const presets = computed(() =>
  presetScale.value === 'standard'
    ? ['10000', '5000', '2500']
    : draft.value.sizingMode === 'risk_at_stop'
      ? ['10', '25', '50']
      : ['25', '50', '100'],
)
</script>

<template>
  <div class="sizing-modes">
    <button
      type="button"
      :class="{ active: draft.sizingMode === 'risk_at_stop' }"
      @click="draft.sizingMode = 'risk_at_stop'"
    >
      Size by risk
    </button>
    <button
      type="button"
      :class="{ active: draft.sizingMode !== 'risk_at_stop' }"
      @click="draft.sizingMode = 'quote_notional'"
    >
      Fixed size
    </button>
  </div>

  <div class="ticket-grid">
    <FormField
      v-if="draft.sizingMode !== 'risk_at_stop'"
      label="Fixed size type"
      help="Enter quote-currency notional or exact base quantity."
    >
      <select v-model="draft.sizingMode" class="input">
        <option value="quote_notional">{{ labelWithUnit('Notional', units.quote) }}</option>
        <option value="base">{{ labelWithUnit('Base quantity', units.base) }}</option>
      </select>
    </FormField>
    <FormField
      :label="
        draft.sizingMode === 'risk_at_stop'
          ? labelWithUnit('Risk lost at SL', units.quote)
          : draft.sizingMode === 'base'
            ? labelWithUnit('Base quantity', units.base)
            : labelWithUnit('Notional', units.quote)
      "
      :help="
        draft.sizingMode === 'risk_at_stop'
          ? 'Maximum loss at the configured stop. Trad derives the entry quantity.'
          : 'Requested fixed entry size before exchange normalization.'
      "
      required
    >
      <input
        v-model="draft.amount"
        class="input"
        :class="{ 'input-required-empty': draft.amount.trim() === '' }"
        inputmode="decimal"
        placeholder="Required"
        required
      />
    </FormField>
  </div>

  <div v-if="draft.sizingMode !== 'base'" class="preset-section">
    <div class="preset-heading">
      <span>{{ draft.sizingMode === 'risk_at_stop' ? 'Risk presets' : 'Notional presets' }}</span>
      <div class="preset-scale" aria-label="Preset scale">
        <button
          type="button"
          :class="{ active: presetScale === 'standard' }"
          @click="presetScale = 'standard'"
        >
          standard
        </button>
        <button
          type="button"
          :class="{ active: presetScale === 'test' }"
          @click="presetScale = 'test'"
        >
          small test
        </button>
      </div>
    </div>
    <div class="size-presets" aria-label="Size presets">
      <button
        v-for="preset in presets"
        :key="preset"
        type="button"
        :class="{ active: draft.amount === preset }"
        @click="draft.amount = preset"
      >
        {{ Number(preset).toLocaleString() }}{{ units.quote ? ` ${units.quote}` : '' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sizing-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border-normal);
}
.sizing-modes button {
  min-height: 30px;
  color: var(--fg-muted);
  background: var(--surface-sunken);
  border: 0;
}
.sizing-modes button.active {
  color: var(--accent-color);
  background: var(--surface-active);
}
.ticket-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.size-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.size-presets button {
  padding: 0.2rem 0.55rem;
  color: var(--fg-muted);
  background: transparent;
  border: 1px solid var(--border-normal);
  font-size: 10px;
}
.size-presets button.active {
  color: var(--accent-color);
  border-color: var(--accent-color);
  background: var(--surface-active);
}
.preset-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.preset-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  color: var(--fg-muted);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.preset-scale {
  display: flex;
  border: 1px solid var(--border-subtle);
}
.preset-scale button {
  min-height: 22px;
  padding: 0.1rem 0.45rem;
  color: var(--fg-muted);
  font-size: 9px;
  background: var(--surface-sunken);
  border: 0;
  border-right: 1px solid var(--border-subtle);
}
.preset-scale button:last-child {
  border-right: 0;
}
.preset-scale button.active {
  color: var(--accent-color);
  background: var(--surface-active);
}
@media (max-width: 520px) {
  .ticket-grid {
    grid-template-columns: 1fr;
  }
}
</style>
