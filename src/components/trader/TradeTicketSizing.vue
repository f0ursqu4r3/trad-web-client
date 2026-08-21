<script setup lang="ts">
import FormField from '@/components/forms/FormField.vue'
import { labelWithUnit, type MarketUnits } from '@/lib/engineCommands/marketUnits'
import type { TradeTicketDraft } from '@/lib/trader/tradeTicketDraft'

defineProps<{ units: MarketUnits }>()
const draft = defineModel<TradeTicketDraft>({ required: true })
const presets = ['25', '50', '100']
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
      required
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
      <input v-model="draft.amount" class="input" inputmode="decimal" />
    </FormField>
  </div>

  <div class="size-presets" aria-label="Size presets">
    <button v-for="preset in presets" :key="preset" type="button" @click="draft.amount = preset">
      {{ preset }}{{ units.quote ? ` ${units.quote}` : '' }}
    </button>
  </div>
</template>

<style scoped>
.sizing-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border-normal);
  border-radius: 9999px;
  overflow: hidden;
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
  color: var(--accent-color);
  background: transparent;
  border: 1px solid var(--border-normal);
  border-radius: 9999px;
  font-size: 10px;
}
@media (max-width: 520px) {
  .ticket-grid {
    grid-template-columns: 1fr;
  }
}
</style>
