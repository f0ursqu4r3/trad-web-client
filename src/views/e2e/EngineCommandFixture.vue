<script setup lang="ts">
import { computed, ref } from 'vue'

import EngineCommandModalContainer from '@/components/engine/commands/EngineCommandModalContainer.vue'
import EngineCommandPalette from '@/components/engine/commands/EngineCommandPalette.vue'
import type {
  BrowserCommandIntent,
  BrowserCommandOutcome,
  BrowserPreviewIntent,
  BrowserPreviewOutcome,
} from '@/lib/gateway'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountsStore } from '@/stores/accounts'
import { CommandOutcomeUnknownError, useGatewayStore } from '@/stores/gateway'

const accountId = '50000000-0000-4000-8000-000000000001'
const accounts = useAccountsStore()
const gateway = useGatewayStore()
const outcomeMode = ref<'accepted' | 'rejected' | 'unknown'>('accepted')
const previewMode = ref<'ready' | 'builder_rejected'>('ready')
const submissions = ref<Array<{ accountId: string; intent: BrowserCommandIntent }>>([])
const previews = ref<Array<{ accountId: string; intent: BrowserPreviewIntent }>>([])
const latest = computed(() => submissions.value[submissions.value.length - 1] ?? null)
const latestPreview = computed(() => previews.value[previews.value.length - 1] ?? null)

accounts.accountsRaw = [
  {
    id: accountId,
    label: 'Engine Commands Testnet',
    key: 'fixture',
    network: NetworkType.Testnet,
    exchange: ExchangeType.Hyperliquid,
  },
]
accounts.selectedAccountId = accountId
gateway.status = 'ready'
gateway.previewCommand = async (intent, submittedAccount): Promise<BrowserPreviewOutcome> => {
  previews.value.push({ accountId: submittedAccount ?? '', intent })
  if (previewMode.value === 'builder_rejected') {
    return {
      kind: 'rejected',
      rejection: {
        code: 'planning_failed',
        reason:
          'command planning failed: Hyperliquid builder approval does not cover this account policy',
        retryable: false,
      },
    }
  }
  const requested = previewRequestedValue(intent)
  return {
    kind: 'ready',
    preview: {
      kind:
        intent.kind === 'place_order'
          ? 'order'
          : intent.kind === 'place_chase'
            ? 'chase'
            : 'trailing_entry',
      symbol: intent.parameters.symbol,
      position_side: intent.parameters.position_side,
      decision_price: '50001',
      price_source: 'best_ask',
      market_observed_at_ms: 10000,
      raw_base_quantity: requested === '75' ? '0.001499970000599988' : '0.000999980000399992',
      normalized_base_quantity: requested === '75' ? '0.001' : '0.000',
      normalized_quote_notional: requested === '75' ? '50.001' : '0',
      children: requested === '75' ? [{ base_quantity: '0.001', quote_notional: '50.001' }] : [],
      instrument: {
        price: { kind: 'hyperliquid_perpetual', size_decimals: 3 },
        quantity_step: '0.001',
        minimum_order_quantity: '0.001',
        maximum_order_quantity: null,
        minimum_order_notional: '10',
        observed_at_ms: 9900,
      },
      warnings: requested === '75' ? ['Quantity was normalized down to the exchange step.'] : [],
    },
  }
}

function previewRequestedValue(intent: BrowserPreviewIntent): string {
  if (intent.kind === 'place_trailing_entry') return intent.parameters.risk_amount
  switch (intent.parameters.sizing.kind) {
    case 'quote_notional':
      return intent.parameters.sizing.amount
    case 'base':
      return intent.parameters.sizing.quantity
    case 'risk_at_stop':
      return intent.parameters.sizing.loss_amount
  }
}

gateway.submitCommand = async (intent, submittedAccount): Promise<BrowserCommandOutcome> => {
  submissions.value.push({ accountId: submittedAccount ?? '', intent })
  if (outcomeMode.value === 'unknown') {
    throw new CommandOutcomeUnknownError(
      '50000000-0000-4000-8000-000000000099',
      'fixture connection interrupted',
    )
  }
  if (outcomeMode.value === 'rejected') {
    return {
      kind: 'rejected',
      rejection: {
        code: 'planning_failed',
        reason: 'fixture planning rejection',
        retryable: false,
      },
    }
  }
  return {
    kind: 'accepted',
    command_id: crypto.randomUUID(),
    account_revision: submissions.value.length,
    duplicate: false,
  }
}
</script>

<template>
  <main class="fixture" data-testid="engine-command-fixture">
    <header>
      <EngineCommandPalette />
      <button class="btn" type="button" @click="outcomeMode = 'accepted'">Accept next</button>
      <button class="btn" type="button" @click="outcomeMode = 'rejected'">Reject next</button>
      <button class="btn" type="button" @click="outcomeMode = 'unknown'">Lose next outcome</button>
      <button class="btn" type="button" @click="previewMode = 'builder_rejected'">
        Require builder approval
      </button>
    </header>
    <pre data-testid="latest-command-intent">{{ latest ? JSON.stringify(latest) : 'none' }}</pre>
    <pre data-testid="latest-preview-intent">{{
      latestPreview ? JSON.stringify(latestPreview) : 'none'
    }}</pre>
    <EngineCommandModalContainer />
  </main>
</template>

<style scoped>
.fixture {
  min-height: 100vh;
  padding: 16px;
  color: var(--color-text);
  background: var(--color-bg);
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
}
pre {
  margin-top: 16px;
  padding: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 1px solid var(--border-color);
}
</style>
