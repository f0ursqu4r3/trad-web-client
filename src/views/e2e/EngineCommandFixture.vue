<script setup lang="ts">
import { computed, ref } from 'vue'

import EngineCommandModalContainer from '@/components/engine/commands/EngineCommandModalContainer.vue'
import EngineCommandPalette from '@/components/engine/commands/EngineCommandPalette.vue'
import type { BrowserCommandIntent, BrowserCommandOutcome } from '@/lib/gateway'
import { ExchangeType, NetworkType } from '@/lib/ws/protocol'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const accountId = '50000000-0000-4000-8000-000000000001'
const accounts = useAccountsStore()
const gateway = useGatewayStore()
const outcomeMode = ref<'accepted' | 'rejected'>('accepted')
const submissions = ref<Array<{ accountId: string; intent: BrowserCommandIntent }>>([])
const latest = computed(() => submissions.value[submissions.value.length - 1] ?? null)

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
gateway.submitCommand = async (intent, submittedAccount): Promise<BrowserCommandOutcome> => {
  submissions.value.push({ accountId: submittedAccount ?? '', intent })
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
    </header>
    <pre data-testid="latest-command-intent">{{ latest ? JSON.stringify(latest) : 'none' }}</pre>
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
