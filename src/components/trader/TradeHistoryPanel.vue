<script setup lang="ts">
import { formatExactDecimal } from '@/lib/exactDecimalMath'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'

defineProps<{ trade: ManagedTradeView }>()
</script>

<template>
  <div class="history-content">
    <div
      v-for="command in [...trade.commands].reverse()"
      :key="command.command_id"
      class="history-row"
    >
      <span>{{ new Date(command.accepted_at).toLocaleTimeString() }}</span>
      <strong>{{ command.accepted.kind.replace(/_/g, ' ') }}</strong>
      <span>{{ command.lifecycle }}</span>
      <code>#{{ command.command_id.slice(0, 8) }}</code>
    </div>
    <div
      v-for="execution in [...trade.executions].reverse()"
      :key="execution.event_id"
      class="history-row fill-row"
    >
      <span>{{ new Date(execution.fill.occurred_at).toLocaleTimeString() }}</span>
      <strong>fill</strong>
      <span
        >{{ formatExactDecimal(execution.fill.quantity) }} @
        {{ formatExactDecimal(execution.fill.price) }}</span
      >
      <code>{{ execution.fill.is_maker ? 'maker' : 'taker' }}</code>
    </div>
    <footer>
      Opened {{ new Date(trade.createdAt).toLocaleString() }} · scope {{ trade.scopeId }}
    </footer>
  </div>
</template>

<style scoped>
.history-content {
  padding: 0.5rem 0.75rem;
}
.history-row {
  display: grid;
  grid-template-columns: 90px minmax(130px, 0.7fr) minmax(140px, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  min-height: 34px;
  border-bottom: 1px solid var(--border-subtle);
}
.history-row span,
.history-row code {
  color: var(--fg-muted);
}
.history-row strong {
  font-weight: 500;
}
.fill-row strong {
  color: var(--state-success);
}
footer {
  margin-top: 0.75rem;
  color: var(--fg-muted);
  font-size: 11px;
}
@media (max-width: 760px) {
  .history-row {
    grid-template-columns: 70px 1fr;
  }
  .history-row code {
    display: none;
  }
}
</style>
