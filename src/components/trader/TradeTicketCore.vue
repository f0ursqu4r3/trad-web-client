<script setup lang="ts">
import FormField from '@/components/forms/FormField.vue'
import LiveMarketPrice from '@/components/engine/commands/LiveMarketPrice.vue'
import type { MarketUnits } from '@/lib/engineCommands/marketUnits'
import type { TradeTicketDraft, TicketEntryType } from '@/lib/trader/tradeTicketDraft'

defineProps<{ accountId: string; units: MarketUnits }>()
const draft = defineModel<TradeTicketDraft>({ required: true })
const entryTypes: TicketEntryType[] = ['market', 'limit', 'chase', 'trailing']
</script>

<template>
  <FormField
    help="Exchange instrument. Trad normalizes and validates it before submission."
    required
  >
    <template #label>
      <span class="symbol-heading">
        <span>Market</span>
        <LiveMarketPrice
          active
          :account-id="accountId"
          :symbol="draft.symbol"
          :quote-asset="units.quote"
        />
      </span>
    </template>
    <input v-model="draft.symbol" class="input" autocomplete="off" placeholder="BTC" />
  </FormField>

  <div class="side-toggle" aria-label="Position side">
    <button
      class="side-button long"
      :class="{ active: draft.positionSide === 'long' }"
      type="button"
      @click="draft.positionSide = 'long'"
    >
      Buy / Long
    </button>
    <button
      class="side-button short"
      :class="{ active: draft.positionSide === 'short' }"
      type="button"
      @click="draft.positionSide = 'short'"
    >
      Sell / Short
    </button>
  </div>

  <div class="entry-tabs" aria-label="Entry type">
    <button
      v-for="kind in entryTypes"
      :key="kind"
      class="entry-tab"
      :class="{ active: draft.entryType === kind }"
      type="button"
      :aria-pressed="draft.entryType === kind"
      @click="draft.entryType = kind"
    >
      {{ kind === 'trailing' ? 'Trailing' : kind }}
    </button>
  </div>
</template>

<style scoped>
.symbol-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.symbol-heading {
  flex-wrap: nowrap;
}
.symbol-heading :deep(.market-price) {
  overflow: hidden;
  max-width: calc(100% - 4.5rem);
  flex-wrap: nowrap;
}
.entry-tabs,
.side-toggle {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border-normal);
}
.entry-tab,
.side-button {
  min-height: 34px;
  padding: 0.45rem 0.35rem;
  color: var(--fg-muted);
  font-size: 12px;
  text-transform: capitalize;
  background: var(--surface-sunken);
  border: 0;
  border-right: 1px solid var(--border-subtle);
}
.entry-tab:last-child,
.side-button:last-child {
  border-right: 0;
}
.entry-tab.active {
  color: var(--fg-strong);
  background: var(--surface-active);
  box-shadow: inset 0 -2px var(--accent-color);
}
.side-toggle {
  grid-template-columns: 1fr 1fr;
}
.side-button.active.long {
  color: var(--state-success);
  background: color-mix(in srgb, var(--state-success) 13%, var(--surface-base));
  box-shadow: inset 0 -2px var(--state-success);
}
.side-button.active.short {
  color: var(--state-error);
  background: color-mix(in srgb, var(--state-error) 11%, var(--surface-base));
  box-shadow: inset 0 -2px var(--state-error);
}
</style>
