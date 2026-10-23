<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'

import ProjectionDetails from '@/components/engine/ProjectionDetails.vue'
import MarketSymbolLabel from '@/components/general/MarketSymbolLabel.vue'
import type { TradeSummary } from '@/lib/gateway/tradeSummary'
import { summaryNet } from '@/lib/projection/tradeHistory'
import TradeHistoryPanel from './TradeHistoryPanel.vue'

// One older closed trade as the server summarized it (slice S3): a compact
// row that opens onto its fills and its evidence, both loaded on demand.

const props = defineProps<{ summary: TradeSummary; expanded: boolean }>()
const emit = defineEmits<{ (event: 'toggle', tradeId: string): void }>()

const tab = ref<'fills' | 'evidence'>('fills')
const net = computed(() => summaryNet(props.summary))
const when = computed(() => {
  const at = props.summary.closed_at ?? props.summary.created_at
  return new Date(at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})
const whenTitle = computed(() => {
  const opened = `Opened ${new Date(props.summary.created_at).toLocaleString()}`
  return props.summary.closed_at === null
    ? opened
    : `${opened} · closed ${new Date(props.summary.closed_at).toLocaleString()}`
})
</script>

<template>
  <article
    class="closed-row"
    :class="{ expanded }"
    data-testid="closed-trade-row"
    :data-trade-id="summary.trade_id"
  >
    <button
      class="closed-row-head"
      type="button"
      :aria-expanded="expanded"
      @click="emit('toggle', summary.trade_id)"
    >
      <ChevronDown v-if="expanded" :size="14" aria-hidden="true" />
      <ChevronRight v-else :size="14" aria-hidden="true" />
      <strong class="row-symbol"><MarketSymbolLabel :symbol="summary.symbol" /></strong>
      <span class="row-side" :class="summary.side">{{ summary.side }}</span>
      <span class="row-entry">{{ summary.entry_label }}</span>
      <span class="row-meta" :title="whenTitle">
        {{ when }} · {{ summary.fill_count }} {{ summary.fill_count === 1 ? 'fill' : 'fills' }}
        <template v-if="summary.lifecycle === 'taken_over'"> · taken over</template>
      </span>
      <span class="row-net" :data-tone="net.tone" :title="net.title">{{ net.label }}</span>
    </button>
    <div v-if="expanded" class="closed-row-detail">
      <nav class="detail-tabs" aria-label="Closed trade details">
        <button type="button" :aria-pressed="tab === 'fills'" @click="tab = 'fills'">fills</button>
        <button type="button" :aria-pressed="tab === 'evidence'" @click="tab = 'evidence'">
          evidence
        </button>
      </nav>
      <TradeHistoryPanel v-if="tab === 'fills'" :trade="null" :summary="summary" />
      <div v-else class="evidence-detail">
        <ProjectionDetails :show-actions="false" :history-trade-id="summary.trade_id" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.closed-row {
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--border-normal);
  background: var(--surface-base);
}
.closed-row.expanded {
  border-color: var(--border-normal);
}
.closed-row-head {
  display: grid;
  width: 100%;
  min-height: 38px;
  grid-template-columns: 14px minmax(3.5rem, auto) 3.2rem minmax(4rem, 1fr) auto minmax(7rem, auto);
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0.65rem;
  color: var(--fg);
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.closed-row-head > svg {
  color: var(--fg-muted);
}
.row-symbol {
  color: var(--fg-strong);
  font-weight: 600;
}
.row-side {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.row-side.long {
  color: var(--state-success);
}
.row-side.short {
  color: var(--state-error);
}
.row-entry,
.row-meta {
  overflow: hidden;
  color: var(--fg-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-net {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.row-net[data-tone='gain'] {
  color: var(--state-success);
}
.row-net[data-tone='loss'] {
  color: var(--state-error);
}
.row-net[data-tone='unknown'] {
  color: var(--state-warning);
  font-size: 12px;
}
.closed-row-detail {
  border-top: 1px solid var(--border-normal);
  background: var(--surface-sunken);
}
.detail-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-normal);
}
.detail-tabs button {
  min-height: 34px;
  padding: 0 0.85rem;
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  border-right: 1px solid var(--border-subtle);
}
.detail-tabs button[aria-pressed='true'] {
  color: var(--fg-strong);
  background: var(--surface-base);
  box-shadow: inset 0 -2px var(--accent-color);
}
.evidence-detail {
  max-height: 480px;
  overflow: auto;
  background: var(--surface-base);
}
@media (max-width: 620px) {
  .closed-row {
    border-left-width: 2px;
  }
  .closed-row-head {
    grid-template-columns: 14px auto auto minmax(0, 1fr);
    grid-template-areas:
      'icon symbol side net'
      '. meta meta meta';
    row-gap: 0.1rem;
    column-gap: 0.4rem;
    min-height: 44px;
    padding: 0.3rem 0.45rem;
  }
  .closed-row-head > svg {
    grid-area: icon;
  }
  .row-symbol {
    grid-area: symbol;
  }
  .row-side {
    grid-area: side;
    font-size: 10px;
  }
  .row-entry {
    display: none;
  }
  .row-meta {
    grid-area: meta;
    font-size: 11px;
  }
  .row-net {
    grid-area: net;
  }
}
</style>
