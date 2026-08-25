<script setup lang="ts">
import { computed, ref } from 'vue'

import FormField from '@/components/forms/FormField.vue'
import MarketSymbolCombobox from '@/components/forms/MarketSymbolCombobox.vue'
import LiveMarketPrice from '@/components/engine/commands/LiveMarketPrice.vue'
import type { MarketUnits } from '@/lib/engineCommands/marketUnits'
import type { TradeTicketDraft, TicketEntryType } from '@/lib/trader/tradeTicketDraft'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps<{ accountId: string; units: MarketUnits }>()
const draft = defineModel<TradeTicketDraft>({ required: true })
const accounts = useAccountsStore()
const account = computed(
  () => accounts.accounts.find((item) => item.id === props.accountId) ?? null,
)
const marketError = ref<string | null>(null)
const entryTypes: TicketEntryType[] = ['market', 'limit', 'chase', 'trailing']
</script>

<template>
  <FormField
    label="Market"
    help="Exchange instrument. Type to filter the markets available for this account."
    :error="marketError"
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
    <MarketSymbolCombobox
      v-model="draft.symbol"
      :account="account"
      @validity="marketError = $event"
    />
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
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.symbol-heading {
  flex-wrap: nowrap;
}
.symbol-heading :deep(.market-price) {
  max-width: none;
  flex: 0 0 auto;
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
