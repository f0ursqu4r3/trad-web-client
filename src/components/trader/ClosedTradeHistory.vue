<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import HistoryPagerFooter from '@/components/history/HistoryPagerFooter.vue'
import type { TradeSummary } from '@/lib/gateway/tradeSummary'
import { pagedClosedTrades, summaryMatches } from '@/lib/projection/tradeHistory'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useTradeHistoryStore } from '@/stores/tradeHistory'
import ClosedTradeRow from './ClosedTradeRow.vue'

// Older closed trades after the live cards (slice S3): pages come in as the
// list's end nears the screen (or on the button), as compact summary rows.
// Rows render in blocks; a block far from the screen keeps only its
// measured height, so a long history stays light on a phone.

const props = defineProps<{
  // Trades the live cards show; their rows are skipped.
  cardScopeIds: ReadonlySet<string>
  query: string
  // What the footer says when no page held an older trade.
  emptyLabel: string
}>()
const emit = defineEmits<{ (event: 'shown', rows: number): void }>()

const BLOCK_ROWS = 25
// How far past the screen blocks stay rendered and the next page loads.
const NEAR_PX = 900

const history = useTradeHistoryStore()
const projections = useAccountProjectionStore()
const root = ref<HTMLElement | null>(null)
const sentinel = ref<HTMLElement | null>(null)
const expandedId = ref<string | null>(null)
const nearBlocks = reactive(new Set<number>())
const blockHeights = reactive(new Map<number, number>())
const blockElements = new Map<number, Element>()
// Blocks the observer has placed at least once; until then a block renders.
const placedBlocks = reactive(new Set<number>())
let blockObserver: IntersectionObserver | null = null
let sentinelObserver: IntersectionObserver | null = null
let sizeObserver: ResizeObserver | null = null
let scroller: HTMLElement | null = null

const state = computed(
  () =>
    history.selected ?? {
      accountId: null,
      items: [] as readonly TradeSummary[],
      status: 'idle' as const,
      waitingMs: null,
      error: null,
    },
)
const rows = computed(() =>
  pagedClosedTrades(
    state.value.items,
    props.cardScopeIds,
    projections.selected?.view?.summaries ?? null,
  ).filter((summary) => summaryMatches(summary, props.query)),
)
const blocks = computed(() => {
  const result: TradeSummary[][] = []
  for (let start = 0; start < rows.value.length; start += BLOCK_ROWS) {
    result.push(rows.value.slice(start, start + BLOCK_ROWS))
  }
  return result
})

function rendered(index: number): boolean {
  return nearBlocks.has(index) || !blockHeights.has(index) || !placedBlocks.has(index)
}

function trackBlock(index: number, element: Element | null): void {
  const previous = blockElements.get(index)
  if (previous === element) return
  if (previous !== undefined) {
    blockObserver?.unobserve(previous)
    sizeObserver?.unobserve(previous)
    blockElements.delete(index)
  }
  if (element === null) return
  blockElements.set(index, element)
  blockObserver?.observe(element)
  sizeObserver?.observe(element)
}

function blockIndex(element: Element): number {
  return Number((element as HTMLElement).dataset.block)
}

function toggle(tradeId: string): void {
  expandedId.value = expandedId.value === tradeId ? null : tradeId
}

function loadMore(): void {
  void history.loadMore()
}

// The nearest scrolling ancestor: the main pane, or the trade list on phones.
function scrollRoot(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return parent
  }
  return null
}

onMounted(() => {
  const element = root.value
  if (element === null) return
  scroller = scrollRoot(element)
  const margin = `${NEAR_PX}px 0px ${NEAR_PX}px 0px`
  blockObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = blockIndex(entry.target)
        placedBlocks.add(index)
        if (entry.isIntersecting) nearBlocks.add(index)
        else nearBlocks.delete(index)
      }
    },
    { root: scroller, rootMargin: margin },
  )
  sentinelObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadIfNear()
    },
    { root: scroller, rootMargin: margin },
  )
  sizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const index = blockIndex(entry.target)
      // Only a rendered block's height is its rows' height.
      if (rendered(index) && entry.contentRect.height > 0) {
        blockHeights.set(index, entry.contentRect.height)
      }
    }
  })
  for (const block of blockElements.values()) {
    blockObserver.observe(block)
    sizeObserver.observe(block)
  }
  if (sentinel.value !== null) sentinelObserver.observe(sentinel.value)
})

onBeforeUnmount(() => {
  blockObserver?.disconnect()
  sentinelObserver?.disconnect()
  sizeObserver?.disconnect()
})

watch(
  () => rows.value.length,
  (count) => emit('shown', count),
  { immediate: true },
)

// Other rows land in each block: measure again.
watch([() => props.query, () => state.value.accountId], () => blockHeights.clear())

// Whether the list's end is within NEAR_PX of the visible area, measured
// now: the observer's last word predates rows a page just added.
function endIsNear(): boolean {
  const end = sentinel.value
  if (end === null || end.offsetParent === null) return false
  const bottom = scroller?.getBoundingClientRect().bottom ?? window.innerHeight
  return end.getBoundingClientRect().top <= bottom + NEAR_PX
}

// Infinite scroll: the next page whenever the end is near and nothing is
// in flight; a refusal waits for "Try again".
function loadIfNear(): void {
  if (state.value.status === 'idle' && endIsNear()) loadMore()
}

// After a page (or an account switch) the observer is asked afresh: it only
// reports changes, and a reader who stayed at the end changed nothing.
watch([() => state.value.status, () => state.value.accountId], async ([status]) => {
  if (status !== 'idle') return
  await nextTick()
  const end = sentinel.value
  if (end === null || sentinelObserver === null) return
  sentinelObserver.unobserve(end)
  sentinelObserver.observe(end)
})
</script>

<template>
  <section ref="root" class="closed-history" data-testid="closed-trade-history">
    <h2 v-if="rows.length" class="closed-history-title">
      Older closed trades <span>{{ rows.length }}</span>
    </h2>
    <div
      v-for="(block, index) in blocks"
      :key="index"
      :ref="(element) => trackBlock(index, element as Element | null)"
      class="closed-history-block"
      :data-block="index"
      :style="rendered(index) ? undefined : { height: `${blockHeights.get(index)}px` }"
    >
      <template v-if="rendered(index)">
        <ClosedTradeRow
          v-for="summary in block"
          :key="summary.trade_id"
          :summary="summary"
          :expanded="expandedId === summary.trade_id"
          @toggle="toggle"
        />
      </template>
    </div>
    <div ref="sentinel" class="closed-history-end">
      <HistoryPagerFooter
        :state="state"
        more-label="Load older closed trades"
        loading-label="Loading older closed trades…"
        done-label="That is every closed trade."
        :empty-label="emptyLabel"
        @load="loadMore"
      />
    </div>
  </section>
</template>

<style scoped>
.closed-history {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.closed-history-title {
  margin: 0.25rem 0 0;
  color: var(--fg-muted);
  font-size: 12px;
  font-weight: 500;
}
.closed-history-title span {
  margin-left: 0.3rem;
  color: var(--fg-subtle);
}
.closed-history-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
@media (max-width: 620px) {
  .closed-history {
    gap: 0.4rem;
  }
  .closed-history-block {
    gap: 0.3rem;
  }
}
</style>
