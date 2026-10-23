<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import HistoryPagerFooter from '@/components/history/HistoryPagerFooter.vue'
import { useHistoryPager } from '@/composables/useHistoryPager'
import { historyClient } from '@/lib/gateway/historyShared'
import type { ExposureHistoryRow } from '@/lib/gateway/historyPages'
import { useAccountsStore } from '@/stores/accounts'

// A coin's owned exposures beyond the live ones (slice S3): when the
// snapshot counts more than it lists (owned_exposure_total), "show closed
// (N)" pages them from the server, newest owning trade first.

const props = defineProps<{
  symbol: string
  // Scopes the live position already lists.
  liveScopeIds: string[]
  // The snapshot's count of every owned exposure, when it sends one.
  total: number | null
}>()

const accounts = useAccountsStore()
const open = ref(false)
const pagedTotal = ref<number | null>(null)
const exposures = useHistoryPager<ExposureHistoryRow>({
  fetchPage: async (cursor, onWait) => {
    const accountId = accounts.selectedAccountId
    if (accountId === null) return { items: [], next: null }
    const page = await historyClient().exposures(accountId, props.symbol, cursor, { onWait })
    pagedTotal.value = page.total
    return { items: page.exposures, next: page.next }
  },
  id: (row) => row.exposure.scope_id,
})
const live = computed(() => new Set(props.liveScopeIds))
// Shown only when the snapshot says it lists some of the coin's exposures.
const closedCount = computed(() => {
  if (props.total === null) return 0
  return Math.max(0, (pagedTotal.value ?? props.total) - live.value.size)
})
const rows = computed(() =>
  exposures.state.value.items.filter((row) => !live.value.has(row.exposure.scope_id)),
)

watch(
  () => accounts.selectedAccountId,
  () => {
    exposures.reset()
    pagedTotal.value = null
    open.value = false
  },
)

function toggle(): void {
  open.value = !open.value
  if (open.value && exposures.state.value.items.length === 0) void exposures.loadMore()
}

function createdLabel(value: number | null): string {
  return value === null ? 'unknown start' : new Date(value).toLocaleDateString()
}
</script>

<template>
  <div v-if="closedCount > 0" class="exposure-history" data-testid="exposure-history">
    <button class="btn btn-xs" type="button" :aria-expanded="open" @click="toggle">
      {{ open ? 'hide closed' : 'show closed' }} ({{ closedCount }})
    </button>
    <template v-if="open">
      <div
        v-for="row in rows"
        :key="row.exposure.scope_id"
        class="exposure-row"
        data-testid="closed-exposure"
      >
        <span :title="row.exposure.scope_id">{{ row.exposure.scope_id.slice(0, 12) }}</span>
        <span>{{ row.exposure.side }} · {{ createdLabel(row.created_at) }}</span>
        <span>{{ row.exposure.opened_quantity }} opened</span>
        <span>{{ row.exposure.reduced_quantity }} reduced</span>
        <strong>{{ row.exposure.remaining_quantity }} remaining</strong>
      </div>
      <HistoryPagerFooter
        v-if="exposures.state.value.status !== 'done' || rows.length === 0"
        :state="exposures.state.value"
        more-label="Load more exposures"
        loading-label="Loading closed exposures…"
        done-label=""
        empty-label="No closed exposures beyond the ones listed."
        @load="exposures.loadMore()"
      />
    </template>
  </div>
</template>

<style scoped>
.exposure-history {
  padding-top: 6px;
}
.exposure-row {
  display: grid;
  grid-template-columns: minmax(110px, 1.4fr) repeat(4, minmax(80px, 1fr));
  gap: 8px;
  padding: 5px 0;
  color: var(--color-text-dim);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
  font-size: 10px;
}
.exposure-row span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 620px) {
  .exposure-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
