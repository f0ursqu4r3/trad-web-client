<script setup lang="ts">
import { computed, onMounted } from 'vue'

import HistoryPagerFooter from '@/components/history/HistoryPagerFooter.vue'
import { useHistoryPager } from '@/composables/useHistoryPager'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import type { CommandProjection, OrderProjection, ProtectionProjection } from '@/lib/gateway'
import { historyClient } from '@/lib/gateway/historyShared'
import type { TradeEvidencePage } from '@/lib/gateway/historyPages'
import { useAccountsStore } from '@/stores/accounts'
import CommandDetails from './CommandDetails.vue'
import EvidenceDisclosure from './EvidenceDisclosure.vue'
import OrderDetails from './OrderDetails.vue'
import ProtectionEvidence from './ProtectionEvidence.vue'

// Evidence of a trade outside the live snapshot, from the server's evidence
// route (slice S3): its commands, orders and exchange protection orders
// page through one cursor; the rest comes on the first page.

const props = defineProps<{ tradeId: string }>()

const accounts = useAccountsStore()
const accountId = accounts.selectedAccountId
let pageNumber = 0
const evidence = useHistoryPager<TradeEvidencePage>({
  fetchPage: async (cursor, onWait) => {
    if (accountId === null) return { items: [], next: null }
    const page = await historyClient().tradeEvidence(accountId, props.tradeId, cursor, { onWait })
    return { items: [page], next: page.next }
  },
  id: () => String((pageNumber += 1)),
})
const pages = computed(() => evidence.state.value.items)
const first = computed(() => pages.value[0] ?? null)
const commands = computed(() =>
  unique<CommandProjection>(
    pages.value.flatMap((page) => page.commands),
    (row) => row.command_id,
  ),
)
const orders = computed(() =>
  unique<OrderProjection>(
    pages.value.flatMap((page) => page.orders),
    (row) => row.order_id,
  ),
)
const protections = computed(() =>
  unique<ProtectionProjection>(
    pages.value.flatMap((page) => page.protections),
    (row) => row.remote_order_id,
  ),
)
const amendment = computed(() =>
  activeProtectionAmendment(
    first.value?.native_protection ?? null,
    first.value?.protection_amendments ?? [],
  ),
)
const createdAt = computed(() =>
  commands.value.length === 0 ? null : Math.min(...commands.value.map((row) => row.accepted_at)),
)

onMounted(() => void evidence.loadMore())

function unique<T>(rows: T[], id: (row: T) => string): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = id(row)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
</script>

<template>
  <div class="details-scroll" data-testid="trade-evidence">
    <div class="entity-meta">
      <span
        >Trade ID: <strong>{{ tradeId }}</strong></span
      >
      <span
        >Created:
        <strong>{{ createdAt === null ? '-' : new Date(createdAt).toLocaleString() }}</strong></span
      >
    </div>
    <div class="entity-heading">
      <div class="entity-title">Trade evidence</div>
      <span class="entity-status">from history</span>
    </div>
    <CommandDetails v-for="command in commands" :key="command.command_id" :command="command" />
    <EvidenceDisclosure v-if="orders.length" :title="`Orders (${orders.length})`">
      <OrderDetails v-for="order in orders" :key="order.order_id" :order="order" />
    </EvidenceDisclosure>
    <ProtectionEvidence
      :native-protection="first?.native_protection ?? null"
      :exchange-protections="protections"
      :amendment="amendment"
    />
    <HistoryPagerFooter
      v-if="evidence.state.value.status !== 'done' || pages.length === 0"
      :state="evidence.state.value"
      more-label="Load more evidence"
      loading-label="Loading evidence…"
      done-label=""
      empty-label="No evidence."
      @load="evidence.loadMore()"
    />
  </div>
</template>

<style scoped>
.details-scroll {
  min-height: 0;
  overflow: auto;
}
.entity-meta {
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  color: var(--color-text-dim);
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 8px 12px;
}
.entity-meta strong {
  color: var(--color-text);
  font-weight: normal;
  overflow-wrap: anywhere;
}
.entity-heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 5px;
  border-bottom: 1px solid var(--border-color);
}
.entity-title {
  font-size: 12px;
  color: var(--color-text);
}
.entity-status {
  border: 1px solid currentColor;
  color: var(--color-text-dim);
  font-size: 11px;
  padding: 2px 7px;
  text-transform: uppercase;
}
</style>
