<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-vue-next'

import ProtectionAmendmentModal from '@/components/engine/actions/ProtectionAmendmentModal.vue'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { managedTradeActions } from '@/lib/projection/tradeWorkspaceActions'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useProjectionUiStore } from '@/stores/projectionUi'
import ManagedTradeActions from './ManagedTradeActions.vue'
import ManagedTradeExpansion from './ManagedTradeExpansion.vue'
import ManagedTradeMetrics from './ManagedTradeMetrics.vue'

const props = defineProps<{
  trade: ManagedTradeView
  snapshot: BrowserAccountSnapshot
  expanded: boolean
}>()
const emit = defineEmits<{
  (event: 'toggle', tradeId: string): void
}>()

type DetailTab = 'orders' | 'devices' | 'graph' | 'history'
interface ActionBarApi {
  openClose(percent: string | null): void
  openTakeover(): void
}

const ui = useProjectionUiStore()
const accounts = useAccountsStore()
const gateway = useGatewayStore()
const actionBar = ref<ActionBarApi | null>(null)
const detailTab = ref<DetailTab>('orders')
const moveProtectionOpen = ref(false)
const moveChildId = ref<string | null>(null)
const resyncBusy = ref(false)
const resyncError = ref<string | null>(null)
const availableActions = computed(() => managedTradeActions(props.trade, props.snapshot))
const activeAmendment = computed(() =>
  activeProtectionAmendment(props.trade.protection, props.snapshot.protection_amendments),
)

watch(
  () => props.expanded,
  (expanded) => {
    if (expanded) ui.selectCommand(props.trade.primaryCommand.command_id)
  },
)

function toggle(): void {
  if (!props.expanded) ui.selectCommand(props.trade.primaryCommand.command_id)
  emit('toggle', props.trade.tradeId)
}

function openDetail(tab: DetailTab): void {
  detailTab.value = tab
  ui.selectCommand(props.trade.primaryCommand.command_id)
  if (!props.expanded) emit('toggle', props.trade.tradeId)
}

function openMoveProtection(childId: string): void {
  moveChildId.value = childId
  moveProtectionOpen.value = true
}

async function resyncTotals(): Promise<void> {
  resyncBusy.value = true
  resyncError.value = null
  try {
    await gateway.refreshReconciliation()
  } catch (error) {
    resyncError.value = error instanceof Error ? error.message : String(error)
  } finally {
    resyncBusy.value = false
  }
}
</script>

<template>
  <article
    class="trade-card"
    :class="[`trade-${trade.lifecycle}`, { expanded }]"
    :data-trade-id="trade.tradeId"
    data-testid="managed-trade-card"
  >
    <header class="trade-heading">
      <button class="trade-expand" type="button" :aria-expanded="expanded" @click="toggle">
        <ChevronDown v-if="expanded" :size="15" />
        <ChevronRight v-else :size="15" />
        <strong>{{ trade.symbol }}</strong>
        <span class="trade-side" :class="trade.side">{{ trade.side }}</span>
        <span class="trade-kind">{{ trade.entryLabel }}</span>
      </button>
      <div class="trade-header-actions">
        <button class="btn btn-xs" type="button" @click="openDetail('history')">history</button>
        <button
          class="btn btn-xs"
          type="button"
          title="Open command and device execution evidence"
          @click="openDetail('devices')"
        >
          log
        </button>
        <button
          class="btn btn-xs"
          type="button"
          :disabled="!gateway.isConnected || resyncBusy"
          :title="resyncError ?? 'Refresh authoritative exchange state and reproject this trade'"
          @click="resyncTotals"
        >
          {{ resyncBusy ? 'resyncing…' : 'resync totals' }}
        </button>
        <button
          v-if="availableActions.takeover"
          class="btn btn-xs btn-outline-warn"
          type="button"
          @click="actionBar?.openTakeover()"
        >
          take over
        </button>
        <button
          v-if="availableActions.close"
          class="btn btn-xs btn-outline-danger"
          type="button"
          @click="actionBar?.openClose(null)"
        >
          close all
        </button>
      </div>
      <div class="trade-heading-status">
        <span v-if="trade.attentionReason" :title="trade.attentionReason">
          <TriangleAlert :size="14" />
        </span>
        <span class="pill pill-sm" :class="`pill-${trade.lifecycle}`">{{ trade.lifecycle }}</span>
      </div>
    </header>

    <div v-if="trade.attentionReason" class="trade-alert">{{ trade.attentionReason }}</div>
    <ManagedTradeMetrics :trade="trade" @move-protection="openMoveProtection" />
    <ManagedTradeActions ref="actionBar" :trade="trade" :snapshot="snapshot" />
    <ManagedTradeExpansion
      v-if="expanded"
      v-model:active-tab="detailTab"
      :trade="trade"
      :snapshot="snapshot"
    />
  </article>

  <ProtectionAmendmentModal
    :open="moveProtectionOpen"
    :account-id="accounts.selectedAccountId ?? ''"
    :protection="trade.protection"
    :active-amendment="activeAmendment"
    :focus-child-id="moveChildId"
    @close="moveProtectionOpen = false"
  />
</template>

<style scoped>
.trade-card {
  border: 1px solid var(--border-normal);
  border-left: 3px solid var(--border-strong);
  background: var(--surface-base);
  transition: border-color var(--duration-fast) var(--ease-out-standard);
}
.trade-card:hover,
.trade-card.expanded {
  border-color: var(--border-strong);
}
.trade-card.trade-attention {
  border-left-color: var(--state-error);
}
.trade-card.trade-entering,
.trade-card.trade-closing {
  border-left-color: var(--state-warning);
}
.trade-card.trade-active {
  border-left-color: var(--state-success);
}
.trade-card.trade-taken_over {
  border-left-color: var(--state-info);
}
.trade-heading {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.35rem 0.75rem;
  background: color-mix(in srgb, var(--surface-muted) 72%, var(--surface-base));
  border-bottom: 1px solid var(--border-subtle);
}
.trade-header-actions {
  display: flex;
  margin-left: auto;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}
.trade-expand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.55rem;
  color: var(--fg);
  background: none;
  border: 0;
}
.trade-expand strong {
  font-size: 15px;
}
.trade-side {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}
.trade-side.long {
  color: var(--state-success);
}
.trade-side.short {
  color: var(--state-error);
}
.trade-kind {
  color: var(--fg-muted);
  font-size: 12px;
}
.trade-heading-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pill-active {
  --_c: var(--state-success);
}
.pill-entering,
.pill-closing {
  --_c: var(--state-warning);
}
.pill-attention {
  --_c: var(--state-error);
}
.pill-taken_over {
  --_c: var(--state-info);
}
.trade-alert {
  padding: 0.55rem 0.75rem;
  color: var(--state-error);
  background: color-mix(in srgb, var(--state-error) 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--state-error) 30%, var(--border-subtle));
}
@media (max-width: 760px) {
  .trade-expand {
    flex: 1 1 auto;
  }
  .trade-header-actions {
    width: 100%;
    order: 3;
    justify-content: flex-start;
  }
  .trade-heading-status {
    margin-left: auto;
  }
}
</style>
