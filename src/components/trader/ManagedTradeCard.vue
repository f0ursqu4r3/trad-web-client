<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Pin, TriangleAlert } from 'lucide-vue-next'

import ProtectionAmendmentModal from '@/components/engine/actions/ProtectionAmendmentModal.vue'
import { activeProtectionAmendment } from '@/lib/engineCommands/protectionAmendment'
import type { EngineCommandPrefill } from '@/lib/engineCommands/prefill'
import type { BrowserAccountSnapshot } from '@/lib/gateway'
import type { ManagedTradeView } from '@/lib/projection/tradeWorkspace'
import { managedTradeActions } from '@/lib/projection/tradeWorkspaceActions'
import { managedTradeTrailingEntries } from '@/lib/projection/tradeWorkspaceCharts'
import { longPress } from '@/lib/longPress'
import { useAccountsStore } from '@/stores/accounts'
import { useProjectionUiStore } from '@/stores/projectionUi'
import ManagedTradeActions from './ManagedTradeActions.vue'
import ManagedTradeChart from './ManagedTradeChart.vue'
import ManagedTradeExpansion from './ManagedTradeExpansion.vue'
import ManagedTradeMenu, { type ManagedTradeDetailTab } from './ManagedTradeMenu.vue'
import ManagedTradeMetrics from './ManagedTradeMetrics.vue'

const props = defineProps<{
  trade: ManagedTradeView
  snapshot: BrowserAccountSnapshot
  expanded: boolean
  selected: boolean
  focused: boolean
}>()
const emit = defineEmits<{
  (event: 'toggle', tradeId: string): void
  (event: 'select', tradeId: string): void
  (event: 'duplicate', prefill: EngineCommandPrefill): void
}>()

interface ActionBarApi {
  openClose(percent: string | null): void
  openTakeover(): void
}

const ui = useProjectionUiStore()
const accounts = useAccountsStore()
const actionBar = ref<ActionBarApi | null>(null)
const tradeMenu = ref<InstanceType<typeof ManagedTradeMenu> | null>(null)
const detailTab = ref<ManagedTradeDetailTab>('orders')
const moveProtectionOpen = ref(false)
const moveChildId = ref<string | null>(null)
const chartEntries = computed(() => managedTradeTrailingEntries(props.trade, props.snapshot))
const chartAvailable = computed(() => chartEntries.value.length > 0)
const showMiniChart = ref(props.trade.lifecycle === 'entering' && chartAvailable.value)
const meta = computed(() => ui.meta(props.trade.primaryCommand.command_id))
const availableActions = computed(() => managedTradeActions(props.trade, props.snapshot))
const activeAmendment = computed(() =>
  activeProtectionAmendment(props.trade.protection, props.snapshot.protection_amendments),
)
const createdAtTitle = computed(() => new Date(props.trade.createdAt).toLocaleString())
const createdAtLabel = computed(() => {
  const created = new Date(props.trade.createdAt)
  if (Number.isNaN(created.getTime())) return ''
  const now = new Date()
  const sameDay =
    created.getFullYear() === now.getFullYear() &&
    created.getMonth() === now.getMonth() &&
    created.getDate() === now.getDate()
  if (sameDay) {
    return `today · ${created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  return created.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: created.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

watch(
  () => props.expanded,
  (expanded) => {
    if (expanded) ui.selectCommand(props.trade.primaryCommand.command_id)
  },
)

function toggle(): void {
  emit('select', props.trade.tradeId)
  if (!props.expanded) ui.selectCommand(props.trade.primaryCommand.command_id)
  emit('toggle', props.trade.tradeId)
}

function openDetail(tab: ManagedTradeDetailTab): void {
  emit('select', props.trade.tradeId)
  detailTab.value = tab
  ui.selectCommand(props.trade.primaryCommand.command_id)
  if (!props.expanded) emit('toggle', props.trade.tradeId)
}

function openContext(event: MouseEvent): void {
  event.preventDefault()
  event.stopPropagation()
  emit('select', props.trade.tradeId)
  tradeMenu.value?.openAt(event.clientX, event.clientY)
}

const touchContext = longPress((_: ManagedTradeView, x, y) => {
  emit('select', props.trade.tradeId)
  tradeMenu.value?.openAt(x, y)
})

function openMoveProtection(childId: string): void {
  moveChildId.value = childId
  moveProtectionOpen.value = true
}
</script>

<template>
  <article
    class="trade-card"
    :class="[
      `trade-${trade.lifecycle}`,
      { expanded, selected, focused, 'with-mini-chart': showMiniChart && !expanded },
    ]"
    :data-trade-id="trade.tradeId"
    data-testid="managed-trade-card"
    @contextmenu="openContext"
    @click.capture="touchContext.suppressClick"
    @pointerdown="touchContext.start($event, trade)"
    @pointermove="touchContext.move"
    @pointerup="touchContext.end"
    @pointercancel="touchContext.end"
  >
    <header class="trade-heading">
      <button class="trade-expand" type="button" :aria-expanded="expanded" @click="toggle">
        <ChevronDown v-if="expanded" :size="15" />
        <ChevronRight v-else :size="15" />
        <Pin v-if="meta.pinned" class="trade-pin" :size="12" />
        <strong :style="{ color: meta.nicknameColor ?? undefined }">{{ trade.symbol }}</strong>
        <span class="trade-side" :class="trade.side">{{ trade.side }}</span>
        <span class="trade-kind">{{ trade.entryLabel }}</span>
        <time
          v-if="createdAtLabel"
          class="trade-created-at"
          :datetime="new Date(trade.createdAt).toISOString()"
          :title="createdAtTitle"
        >
          {{ createdAtLabel }}
        </time>
        <span
          v-if="meta.nickname"
          class="trade-nickname"
          :style="{ color: meta.nicknameColor ?? undefined }"
        >
          {{ meta.nickname }}
        </span>
      </button>
      <div class="trade-header-actions">
        <button class="btn btn-xs" type="button" @click="openDetail('history')">history</button>
        <button
          class="btn btn-xs"
          type="button"
          title="Open command and device execution evidence"
          @click="openDetail('devices')"
        >
          execution
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
        <ManagedTradeMenu
          ref="tradeMenu"
          :trade="trade"
          :chart-available="chartAvailable"
          :mini-chart="showMiniChart"
          @detail="openDetail"
          @toggle-mini-chart="showMiniChart = !showMiniChart"
          @duplicate="emit('duplicate', $event)"
        />
      </div>
    </header>

    <div class="trade-body">
      <div class="trade-summary">
        <div v-if="trade.attentionReason" class="trade-alert">{{ trade.attentionReason }}</div>
        <ManagedTradeMetrics :trade="trade" @move-protection="openMoveProtection" />
        <ManagedTradeActions ref="actionBar" :trade="trade" :snapshot="snapshot" />
      </div>
      <ManagedTradeChart
        v-if="showMiniChart && !expanded && chartAvailable"
        class="mini-chart"
        :trade="trade"
        :snapshot="snapshot"
        compact
        :editable="false"
      />
    </div>
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
.trade-card.selected {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg-muted) 72%, transparent);
}
.trade-card.focused {
  animation: trade-focus 900ms var(--ease-out-standard);
}
.trade-card.trade-attention {
  border-left-color: var(--state-error);
}
.trade-card.trade-entering,
.trade-card.trade-closing {
  border-left-color: var(--state-warning);
}
.trade-card.trade-entering {
  border-left-color: var(--state-info);
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
.trade-created-at {
  color: var(--fg-muted);
  font-size: 10px;
  white-space: nowrap;
}
.trade-nickname {
  overflow: hidden;
  max-width: 16rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trade-pin {
  color: var(--fg-muted);
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
.pill-entering {
  --_c: var(--state-info);
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
.trade-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.trade-card.with-mini-chart .trade-body {
  grid-template-columns: minmax(0, 1fr) minmax(300px, 34%);
}
.trade-summary {
  min-width: 0;
}
.mini-chart {
  min-width: 0;
  border-left: 1px solid var(--border-normal);
}
@keyframes trade-focus {
  0%,
  100% {
    outline-color: transparent;
  }
  35% {
    outline-color: var(--fg-strong);
  }
}
.trade-card.focused {
  outline: 2px solid transparent;
  outline-offset: 2px;
}
@media (max-width: 760px) {
  .trade-card {
    border-left-width: 2px;
  }
  .trade-heading {
    min-height: 34px;
    gap: 0.35rem;
    padding: 0.25rem 0.4rem;
  }
  .trade-expand {
    flex: 1 1 auto;
    gap: 0.32rem;
  }
  .trade-expand strong {
    font-size: 13px;
  }
  .trade-kind,
  .trade-side {
    font-size: 10px;
  }
  .trade-created-at {
    font-size: 9px;
  }
  .trade-header-actions {
    display: none;
  }
  .trade-heading-status {
    margin-left: auto;
    gap: 0.25rem;
  }
  .trade-card.with-mini-chart .trade-body {
    grid-template-columns: 1fr;
  }
  .mini-chart {
    border-top: 1px solid var(--border-normal);
    border-left: 0;
  }
}
</style>
