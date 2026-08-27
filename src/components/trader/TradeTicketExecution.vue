<script setup lang="ts">
import FormField from '@/components/forms/FormField.vue'
import PriceDistancePresets from '@/components/forms/PriceDistancePresets.vue'
import { labelWithUnit, type MarketUnits } from '@/lib/engineCommands/marketUnits'
import type { TradeTicketDraft } from '@/lib/trader/tradeTicketDraft'

defineProps<{ units: MarketUnits; accountId: string }>()
const draft = defineModel<TradeTicketDraft>({ required: true })
</script>

<template>
  <div v-if="draft.entryType === 'chase'" class="execution-note">
    <strong>Join top · post-only maker</strong>
    <span>Rests at the current best price and follows it without crossing the book.</span>
  </div>

  <div v-if="draft.entryType === 'limit'" class="ticket-grid">
    <FormField
      :label="labelWithUnit('Limit price', units.quote)"
      help="Exact resting order price."
      telemetry-field="limit_price"
      required
    >
      <input v-model="draft.limitPrice" class="input" inputmode="decimal" required />
    </FormField>
    <FormField
      label="Time in force"
      help="Post Only guarantees maker behavior; GTC may immediately take liquidity."
      telemetry-field="time_in_force"
      required
    >
      <select v-model="draft.timeInForce" class="input">
        <option value="post_only">Post Only</option>
        <option value="good_til_canceled">Good Til Canceled</option>
      </select>
    </FormField>
  </div>

  <div v-if="draft.entryType === 'chase'" class="ticket-grid">
    <FormField
      label="Timeout (seconds)"
      help="Optional chase lifetime. Blank means no time expiry."
      telemetry-field="chase_timeout"
      optional
    >
      <input v-model="draft.expirySeconds" class="input" inputmode="numeric" placeholder="None" />
    </FormField>
    <FormField
      label="Give-up boundary"
      help="Optional adverse price or basis-point boundary. None follows until canceled or filled."
      telemetry-field="chase_boundary_kind"
      optional
    >
      <select v-model="draft.boundaryKind" class="input">
        <option value="none">None</option>
        <option value="price">Fixed price</option>
        <option value="basis_points">Basis points</option>
      </select>
    </FormField>
    <FormField
      v-if="draft.boundaryKind !== 'none'"
      :label="draft.boundaryKind === 'price' ? 'Give-up price' : 'Maximum adverse bps'"
      help="The chase cancels once this boundary is reached."
      telemetry-field="chase_boundary_value"
      required
    >
      <input v-model="draft.boundaryValue" class="input" inputmode="decimal" required />
    </FormField>
    <label class="remainder-toggle">
      <input
        type="checkbox"
        data-telemetry-field="chase_remainder"
        :checked="draft.remainder === 'market_fill'"
        @change="draft.remainder = draft.remainder === 'cancel' ? 'market_fill' : 'cancel'"
      />
      Market-fill remainder on timeout or give-up
    </label>
  </div>

  <div v-if="draft.entryType === 'trailing'" class="ticket-grid">
    <FormField
      :label="labelWithUnit('Activation price', units.quote)"
      help="Price that arms the trailing-entry workflow."
      telemetry-field="trailing_activation_price"
      required
    >
      <input v-model="draft.activationPrice" class="input" inputmode="decimal" required />
      <PriceDistancePresets
        v-model="draft.activationPrice"
        :account-id="accountId"
        :symbol="draft.symbol"
        :position-side="draft.positionSide"
        purpose="activation"
      />
    </FormField>
    <FormField
      label="Jump threshold (bps)"
      help="Required favorable move before the entry executes."
      telemetry-field="trailing_jump_threshold"
      required
    >
      <input v-model="draft.jumpBasisPoints" class="input" inputmode="decimal" required />
    </FormField>
  </div>
</template>

<style scoped>
.execution-note {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.7rem;
  border-left: 2px solid var(--accent-color);
  background: var(--surface-sunken);
}
.execution-note strong {
  color: var(--fg-strong);
  font-size: 12px;
  font-weight: 500;
}
.execution-note span {
  color: var(--fg-muted);
  font-size: 11px;
  line-height: 1.4;
}
.ticket-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.remainder-toggle {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 0.5rem;
  color: var(--fg-muted);
  font-size: 11px;
}
@media (max-width: 520px) {
  .ticket-grid {
    grid-template-columns: 1fr;
  }
}
</style>
