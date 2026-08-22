<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'

import FormField from '@/components/forms/FormField.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import { sizingModePreference } from '@/lib/engineCommands/form'
import { marketUnits } from '@/lib/engineCommands/marketUnits'
import { previewIntent } from '@/lib/engineCommands/intents'
import type { EngineCommandPrefill } from '@/lib/engineCommands/prefill'
import {
  applyTradeTicketPrefill,
  buildTradeTicketIntent,
  newTradeTicketDraft,
} from '@/lib/trader/tradeTicketDraft'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useUiStore } from '@/stores/ui'
import TradeTicketCore from './TradeTicketCore.vue'
import TradeTicketExecution from './TradeTicketExecution.vue'
import TradeTicketPolicy from './TradeTicketPolicy.vue'
import TradeTicketProtection from './TradeTicketProtection.vue'
import TradeTicketSizing from './TradeTicketSizing.vue'

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const ui = useUiStore()
const submission = useEngineCommandSubmission()
const draft = reactive(
  newTradeTicketDraft(
    accounts.selectedAccountId
      ? accounts.getDefaultSymbolForAccount(accounts.selectedAccountId)
      : 'BTC',
    ui.orderQuantityMode,
  ),
)
const previewReady = ref(false)
const acceptedMessage = ref<string | null>(null)
const submitError = ref<string | null>(null)

const account = computed(() => accounts.selectedAccount)
const accountId = computed(() => account.value?.id ?? '')
const units = computed(() => marketUnits(account.value, draft.symbol))
const planningIntent = computed(() => {
  try {
    return previewIntent(buildTradeTicketIntent(draft))
  } catch {
    return null
  }
})
const readiness = computed(() => {
  if (accountId.value === '') return 'Select a trading account.'
  try {
    buildTradeTicketIntent(draft)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  if (!gateway.isConnected) return 'Waiting for the Trad gateway.'
  if (!previewReady.value) return 'Waiting for the authoritative execution preview.'
  return null
})
const canSubmit = computed(
  () => readiness.value === null && !submission.submitting.value && planningIntent.value !== null,
)
const submitLabel = computed(() => {
  const side = draft.positionSide === 'long' ? 'Buy' : 'Sell'
  return `${side} ${draft.symbol.trim().toUpperCase() || 'market'} ${draft.entryType}`
})

watch(accountId, (next) => {
  if (next !== '') draft.symbol = accounts.getDefaultSymbolForAccount(next)
})
watch(
  () => draft.sizingMode,
  (mode) => ui.setOrderQuantityMode(sizingModePreference(mode)),
)
watch(
  () => draft.entryType,
  (kind) => {
    acceptedMessage.value = null
    submitError.value = null
    if (kind === 'trailing') {
      draft.sizingMode = 'risk_at_stop'
      draft.protection.stopLoss.enabled = true
      if (draft.protection.takeProfits.length > 1) {
        draft.protection.takeProfits = draft.protection.takeProfits.slice(0, 1)
      }
    }
  },
)

async function submit(): Promise<void> {
  submitError.value = null
  acceptedMessage.value = null
  try {
    const intent = buildTradeTicketIntent(draft)
    const accepted = await submission.submit({ accountId: accountId.value, intent })
    if (accepted) acceptedMessage.value = `${submitLabel.value} accepted by Trad.`
  } catch (error) {
    submitError.value = error instanceof Error ? error.message : String(error)
  }
}

async function applyPrefill(prefill: EngineCommandPrefill): Promise<void> {
  applyTradeTicketPrefill(draft, prefill)
  await nextTick()
  acceptedMessage.value = 'Duplicated trade loaded. Review it before submitting.'
  submitError.value = null
}

defineExpose({ applyPrefill })
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

    <form class="ticket-body" aria-label="New trade order ticket" @submit.prevent="submit">
      <TradeTicketCore v-model="draft" :account-id="accountId" :units="units" />
      <TradeTicketExecution v-model="draft" :units="units" />
      <TradeTicketSizing v-model="draft" :units="units" />
      <TradeTicketProtection v-model="draft" :units="units" />

      <details v-if="draft.entryType !== 'chase'" class="ticket-advanced">
        <summary>Advanced execution shape</summary>
        <div class="ticket-grid">
          <FormField
            label="Execution shape"
            help="Single order or bounded child-order split."
            required
          >
            <select v-model="draft.shapeMode" class="input">
              <option value="single">Single order</option>
              <option value="split">Split order</option>
            </select>
          </FormField>
          <FormField v-if="draft.shapeMode === 'split'" label="Maximum children" required>
            <input v-model="draft.maxChildren" class="input" inputmode="numeric" required />
          </FormField>
          <FormField v-if="draft.shapeMode === 'split'" label="Target child notional" optional>
            <input v-model="draft.targetChildNotional" class="input" inputmode="decimal" />
          </FormField>
        </div>
      </details>

      <TradeTicketPolicy
        :account="account"
        :account-id="accountId"
        :intent="planningIntent"
        :quote-asset="units.quote"
        @ready="previewReady = $event"
      />

      <p v-if="acceptedMessage" class="ticket-success">{{ acceptedMessage }}</p>
      <p v-else-if="submitError || submission.submissionError.value" class="ticket-error">
        {{ submitError || submission.submissionError.value }}
      </p>
      <p v-else-if="readiness" class="ticket-readiness">{{ readiness }}</p>

      <button class="btn btn-primary submit-button" type="submit" :disabled="!canSubmit">
        {{ submission.submitting.value ? 'Submitting…' : submitLabel }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.ticket {
  min-width: 0;
}
.ticket-body {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.9rem;
}
.ticket-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  padding-top: 0.65rem;
}
.ticket-advanced {
  padding: 0.6rem 0.7rem;
  color: var(--fg-muted);
  background: var(--surface-sunken);
  border: 1px solid var(--border-subtle);
}
.ticket-advanced summary {
  cursor: pointer;
  font-size: 11px;
}
.ticket-readiness,
.ticket-error,
.ticket-success {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
}
.ticket-readiness {
  color: var(--state-warning);
}
.ticket-error {
  color: var(--state-error);
}
.ticket-success {
  color: var(--state-success);
}
.submit-button {
  width: 100%;
  min-height: 40px;
  text-transform: none;
}
@media (max-width: 520px) {
  .ticket-grid {
    grid-template-columns: 1fr;
  }
}
</style>
