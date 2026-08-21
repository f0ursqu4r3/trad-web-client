<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import FormField from '@/components/forms/FormField.vue'
import { newEntryProtectionState } from '@/lib/engineCommands/form'
import type {
  ChaseCommandPrefill,
  OrderCommandPrefill,
  TrailingEntryCommandPrefill,
} from '@/lib/engineCommands/prefill'
import { useAccountsStore } from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'
import { useUiStore } from '@/stores/ui'

type EntryType = 'market' | 'limit' | 'chase' | 'trailing'

const accounts = useAccountsStore()
const modals = useModalStore()
const ui = useUiStore()
const entryType = ref<EntryType>('chase')
const symbol = ref('')
const positionSide = ref<'long' | 'short'>('long')
const amount = ref('50')
const sizingMode = ref<'quote_notional' | 'base' | 'risk_at_stop'>('quote_notional')

const account = computed(() => accounts.selectedAccount)
const accountId = computed(() => account.value?.id ?? '')
const submitLabel = computed(() => {
  const side = positionSide.value === 'long' ? 'Buy / Long' : 'Sell / Short'
  return `${side} · review ${entryType.value}`
})
const resolvedTarget = computed(() => {
  const target = account.value?.exchange_metadata?.builder_target_total_tenths_bps
  return target === null || target === undefined ? null : `${target / 10} bps`
})

watch(
  accountId,
  (next) => {
    if (next === '') return
    symbol.value = accounts.getDefaultSymbolForAccount(next)
  },
  { immediate: true },
)

function review(): void {
  if (accountId.value === '') return
  const common = {
    accountId: accountId.value,
    symbol: symbol.value.trim().toUpperCase(),
    positionSide: positionSide.value,
  }
  if (entryType.value === 'market' || entryType.value === 'limit') {
    const values: OrderCommandPrefill = {
      ...common,
      executionKind: entryType.value,
      sizingMode: sizingMode.value,
      amount: amount.value,
      limitPrice: '',
      timeInForce: 'good_til_canceled',
      shapeMode: 'single',
      targetChildNotional: '',
      maxChildren: '20',
      protection: newEntryProtectionState(),
    }
    modals.openModalWithValues(
      entryType.value === 'market' ? 'EngineMarketOrder' : 'EngineLimitOrder',
      { ...values },
    )
    return
  }
  if (entryType.value === 'chase') {
    const values: ChaseCommandPrefill = {
      ...common,
      sizingMode: sizingMode.value,
      amount: amount.value,
      boundaryKind: 'none',
      boundaryValue: '',
      expirySeconds: '',
      remainder: 'cancel',
      protection: newEntryProtectionState(),
    }
    modals.openModalWithValues('EngineChaseOrder', { ...values })
    return
  }
  const values: TrailingEntryCommandPrefill = {
    ...common,
    activationPrice: '',
    jumpBasisPoints: '',
    stopLossPrice: '',
    takeProfitPrice: '',
    riskAmount: amount.value,
    shapeMode: 'single',
    targetChildNotional: '',
    maxChildren: '20',
    oneWaySemantics: 'target_side_exposure',
  }
  modals.openModalWithValues('EngineTrailingEntry', { ...values })
}

function rememberSizing(): void {
  ui.setOrderQuantityMode(
    sizingMode.value === 'quote_notional'
      ? 'notional'
      : sizingMode.value === 'risk_at_stop'
        ? 'risk'
        : 'base',
  )
}
</script>

<template>
  <section class="ticket trader-panel" aria-labelledby="new-trade-heading">
    <header class="trader-panel-header">
      <div>
        <span class="eyebrow">New trade</span>
        <h2 id="new-trade-heading">Order ticket</h2>
      </div>
      <span class="account-context">{{ account?.label ?? 'No account' }}</span>
    </header>

    <div class="ticket-body">
      <div class="entry-tabs" aria-label="Entry type">
        <button
          v-for="kind in ['market', 'limit', 'chase', 'trailing'] as EntryType[]"
          :key="kind"
          class="entry-tab"
          :class="{ active: entryType === kind }"
          type="button"
          :aria-pressed="entryType === kind"
          @click="entryType = kind"
        >
          {{ kind === 'trailing' ? 'Trailing' : kind }}
        </button>
      </div>

      <FormField
        label="Market"
        help="The exchange instrument. Trad validates the symbol and instrument rules during review."
        required
      >
        <input v-model="symbol" class="input" autocomplete="off" placeholder="BTC" />
      </FormField>

      <div class="side-toggle" aria-label="Position side">
        <button
          class="side-button long"
          :class="{ active: positionSide === 'long' }"
          type="button"
          @click="positionSide = 'long'"
        >
          Buy / Long
        </button>
        <button
          class="side-button short"
          :class="{ active: positionSide === 'short' }"
          type="button"
          @click="positionSide = 'short'"
        >
          Sell / Short
        </button>
      </div>

      <div class="ticket-grid">
        <FormField
          label="Sizing"
          help="Choose quote notional, base quantity, or the amount you are willing to lose at the stop."
          required
        >
          <select v-model="sizingMode" class="input" @change="rememberSizing">
            <option value="quote_notional">Notional</option>
            <option value="base">Base quantity</option>
            <option value="risk_at_stop">Risk at stop</option>
          </select>
        </FormField>
        <FormField
          :label="sizingMode === 'risk_at_stop' ? 'Risk' : 'Amount'"
          help="The full review shows normalized quantity and exact position effect before submission."
          required
        >
          <input v-model="amount" class="input" inputmode="decimal" />
        </FormField>
      </div>

      <div class="ticket-policy">
        <div>
          <span>Protection</span>
          <strong>Stop market enabled by default</strong>
        </div>
        <div>
          <span>Resolved target</span>
          <strong>{{ resolvedTarget ?? 'Server policy' }}</strong>
        </div>
      </div>

      <p class="ticket-note">
        Review opens the complete Trad form for limit terms, stop loss, take profits, execution
        guards, and the authoritative position-effect preview.
      </p>
      <button
        class="btn btn-primary review-button"
        type="button"
        :disabled="accountId === '' || symbol.trim() === '' || amount.trim() === ''"
        @click="review"
      >
        {{ submitLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.ticket {
  min-width: 0;
}
.ticket-body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
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
.ticket-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
}
.ticket-policy {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border-subtle);
  background: var(--surface-sunken);
}
.ticket-policy div {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.ticket-policy span {
  color: var(--fg-muted);
  font-size: 10px;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}
.ticket-policy strong {
  color: var(--fg);
  font-size: 12px;
  font-weight: 400;
}
.ticket-note {
  margin: 0;
  color: var(--fg-muted);
  font-size: 12px;
  line-height: 1.5;
}
.review-button {
  width: 100%;
  min-height: 38px;
}
@media (max-width: 520px) {
  .entry-tabs {
    grid-template-columns: 1fr 1fr;
  }
  .ticket-grid,
  .ticket-policy {
    grid-template-columns: 1fr;
  }
}
</style>
