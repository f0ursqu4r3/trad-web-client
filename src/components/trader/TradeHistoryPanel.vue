<script setup lang="ts">
import { computed, onMounted } from 'vue'

import HistoryPagerFooter from '@/components/history/HistoryPagerFooter.vue'
import { useHistoryPager } from '@/composables/useHistoryPager'
import { formatExactDecimal } from '@/lib/exactDecimalMath'
import { historyClient } from '@/lib/gateway/historyShared'
import type { TradeFill } from '@/lib/gateway/historyPages'
import type { TradeSummary } from '@/lib/gateway/tradeSummary'
import { FILL_ROLE_LABELS, tradeFillsIncomplete } from '@/lib/projection/tradeHistory'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { useAccountsStore } from '@/stores/accounts'

// A trade's commands and fills. A live card whose fills are all in the
// snapshot shows them as they are; otherwise (a paged closed trade, fills
// past the snapshot, or outside activity) the fills come from the server
// on expand, labelled by role.

const props = defineProps<{
  trade: ManagedTradeView | null
  summary?: TradeSummary | null
}>()

const accounts = useAccountsStore()
const tradeId = computed(() => props.trade?.scopeId ?? props.summary?.trade_id ?? null)
const fromServer = computed(
  () => props.trade === null || tradeFillsIncomplete(props.trade, props.summary ?? null),
)
const accountId = accounts.selectedAccountId
const fills = useHistoryPager<TradeFill>({
  fetchPage: async (cursor, onWait) => {
    if (accountId === null || tradeId.value === null) return { items: [], next: null }
    const page = await historyClient().tradeFills(accountId, tradeId.value, cursor, { onWait })
    return { items: page.fills, next: page.next }
  },
  id: (row) => row.execution.event_id,
})
const serverFills = computed(() => fills.state.value.items)
const showServerFills = computed(() => fromServer.value && serverFills.value.length > 0)
const openedAt = computed(() => props.trade?.createdAt ?? props.summary?.created_at ?? null)

onMounted(() => {
  if (fromServer.value) void fills.loadMore()
})

function time(value: number): string {
  return new Date(value).toLocaleTimeString()
}
</script>

<template>
  <div class="history-content">
    <template v-if="trade">
      <div
        v-for="command in [...trade.commands].reverse()"
        :key="command.command_id"
        class="history-row"
      >
        <span>{{ time(command.accepted_at) }}</span>
        <strong>{{ command.accepted.kind.replace(/_/g, ' ') }}</strong>
        <span>{{ command.lifecycle }}</span>
        <code>#{{ command.command_id.slice(0, 8) }}</code>
      </div>
    </template>
    <template v-if="showServerFills">
      <p class="history-note">Fills, oldest first</p>
      <div
        v-for="row in serverFills"
        :key="row.execution.event_id"
        class="history-row fill-row"
        :data-role="row.role"
        data-testid="server-fill"
      >
        <span>{{ time(row.execution.fill.occurred_at) }}</span>
        <strong
          :title="
            row.role === 'manual'
              ? 'Outside activity on this coin. It explains the close; it is not counted in this trade’s numbers.'
              : undefined
          "
          >{{ FILL_ROLE_LABELS[row.role] }}
          <em v-if="row.role === 'manual'" class="not-in-numbers">not in the numbers</em></strong
        >
        <span
          >{{ formatExactDecimal(row.execution.fill.quantity) }} @
          {{ formatExactDecimal(row.execution.fill.price) }}</span
        >
        <code>{{ row.execution.fill.is_maker ? 'maker' : 'taker' }}</code>
      </div>
    </template>
    <template v-else-if="trade">
      <div
        v-for="execution in [...trade.executions].reverse()"
        :key="execution.event_id"
        class="history-row fill-row"
      >
        <span>{{ time(execution.fill.occurred_at) }}</span>
        <strong>fill</strong>
        <span
          >{{ formatExactDecimal(execution.fill.quantity) }} @
          {{ formatExactDecimal(execution.fill.price) }}</span
        >
        <code>{{ execution.fill.is_maker ? 'maker' : 'taker' }}</code>
      </div>
    </template>
    <HistoryPagerFooter
      v-if="fromServer && fills.state.value.status !== 'done'"
      :state="fills.state.value"
      more-label="Load more fills"
      loading-label="Loading fills…"
      done-label=""
      empty-label=""
      @load="fills.loadMore()"
    />
    <p v-else-if="trade === null && serverFills.length === 0" class="history-note">No fills.</p>
    <footer>
      <template v-if="openedAt !== null"
        >Opened {{ new Date(openedAt).toLocaleString() }} · </template
      >scope {{ tradeId }}
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
.fill-row[data-role='manual'] strong {
  color: var(--fg-muted);
}
.not-in-numbers {
  margin-left: 0.35rem;
  padding: 0 0.3rem;
  color: var(--state-warning);
  font-size: 11px;
  font-style: normal;
  border: 1px solid color-mix(in srgb, var(--state-warning) 50%, transparent);
}
.history-note {
  margin: 0.4rem 0 0;
  color: var(--fg-muted);
  font-size: 11px;
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
