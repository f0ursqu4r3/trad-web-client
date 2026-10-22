<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown, LoaderCircle } from 'lucide-vue-next'

import { loadMarketInstruments, type MarketInstrument } from '@/lib/marketCatalog'
import type { MarketCatalogState } from '@/lib/gateway/marketSubscriptionPolicy'
import { marginModeLabel } from '@/lib/hyperliquidMarkets'
import {
  bestOptionIndex,
  filterMarketOptions,
  marketPickerCommit,
  marketPickerPending,
  marketPickerValidity,
  normalizeMarketSymbol,
  type MarketPickerEvent,
  type MarketPickerOption,
} from '@/lib/marketPicker'
import type { AccountRecord } from '@/stores/accounts'

const props = withDefaults(
  defineProps<{
    account: AccountRecord | null
    ariaLabel?: string
    // New trades can only pick tradable markets; closing or canceling work
    // (Flatten, Cancel entry) can pick any listed market.
    newExposure?: boolean
  }>(),
  { ariaLabel: 'Market', newExposure: true },
)
const emit = defineEmits<{ validity: [error: string | null]; pending: [pending: boolean] }>()
// The ticket's market, as Trad's symbol (`XYZ:GOLD`). Typing changes only
// `text`; the model changes when the trader selects a market (see
// marketPickerCommit). The field shows the exchange's spelling (`xyz:GOLD`).
const model = defineModel<string>({ required: true })

let nextComboboxId = 0
const listboxId = `market-symbols-${++nextComboboxId}`
const input = ref<HTMLInputElement | null>(null)
const instruments = ref<MarketInstrument[]>([])
const text = ref(model.value)
const focused = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)
const open = ref(false)
const activeIndex = ref(0)

const bySymbol = computed(
  () => new Map(instruments.value.map((instrument) => [instrument.symbol, instrument])),
)
const normalized = computed(() => normalizeMarketSymbol(text.value))
const listed = computed<MarketCatalogState>(() => {
  if (loading.value) return { status: 'loading' }
  if (loadError.value !== null || instruments.value.length === 0) return { status: 'unavailable' }
  return { status: 'ready', symbols: instruments.value.map((instrument) => instrument.symbol) }
})
const options = computed<MarketPickerOption[]>(() =>
  instruments.value.map((instrument) => {
    const selectable = !props.newExposure || instrument.tradable
    return {
      symbol: instrument.symbol,
      venueSymbol: instrument.venueSymbol,
      group: instrument.group,
      selectable,
      note: selectable ? marketNote(instrument) : instrument.notTradableReason,
    }
  }),
)
// What a selection may commit to: the selectable markets.
const selectable = computed<MarketCatalogState>(() =>
  listed.value.status !== 'ready'
    ? listed.value
    : {
        status: 'ready',
        symbols: options.value.filter((option) => option.selectable).map((option) => option.symbol),
      },
)
const refusals = computed(() =>
  Object.fromEntries(
    options.value
      .filter((option) => !option.selectable)
      .map((option) => [option.symbol, option.note ?? `${option.venueSymbol} cannot be traded`]),
  ),
)
const pending = computed(() => marketPickerPending(text.value, model.value))
// A settled field lists every market; typing filters.
const filtered = computed(() => filterMarketOptions(options.value, pending.value ? text.value : ''))
const grouped = computed(() => new Set(filtered.value.map((option) => option.group)).size > 1)
const activeOption = computed(() => filtered.value[activeIndex.value] ?? null)
// Shown while the typed text has something Enter can select.
const showHint = computed(
  () =>
    focused.value &&
    pending.value &&
    normalized.value !== '' &&
    (filtered.value.some((option) => option.selectable) || listed.value.status !== 'ready'),
)
const validity = computed(() =>
  marketPickerValidity(text.value, model.value, listed.value, focused.value, refusals.value),
)

// Keyed by exchange and network: an accounts refresh that brings a new copy
// of the same account must not reload the catalog or close the list.
const catalogDomain = computed(() =>
  props.account === null ? null : `${props.account.exchange}:${props.account.network}`,
)
watch(
  catalogDomain,
  async (domain) => {
    instruments.value = []
    loadError.value = null
    open.value = false
    const account = props.account
    if (domain === null || account === null) return

    loading.value = true
    try {
      const loaded = await loadMarketInstruments(account)
      if (catalogDomain.value !== domain) return
      instruments.value = loaded
      if (!pending.value) text.value = display(model.value)
    } catch (error) {
      if (catalogDomain.value === domain) {
        loadError.value = error instanceof Error ? error.message : String(error)
      }
    } finally {
      if (catalogDomain.value === domain) loading.value = false
    }
  },
  { immediate: true },
)
// A market set from outside (account switch, duplicated trade) replaces
// whatever was typed.
watch(model, (symbol) => (text.value = display(symbol)), { immediate: true })
watch(filtered, (next) => (activeIndex.value = Math.max(0, bestOptionIndex(next, text.value))))
watch(validity, (error) => emit('validity', error), { immediate: true })
watch(pending, (value) => emit('pending', value), { immediate: true })

function display(symbol: string): string {
  return bySymbol.value.get(normalizeMarketSymbol(symbol))?.venueSymbol ?? symbol
}

function marketNote(instrument: MarketInstrument): string | null {
  const terms = instrument.hyperliquid
  if (terms === null || terms.dex === null) return null
  return [marginModeLabel(terms.marginMode), terms.delisted ? 'delisted' : null]
    .filter(Boolean)
    .join(' · ')
}

function groupLabel(group: string): string {
  if (group !== 'main') return group
  switch (props.account?.exchange) {
    case 'hyperliquid':
      return 'Hyperliquid'
    case 'bybit':
      return 'Bybit'
    case 'binance':
      return 'Binance'
    default:
      return 'Markets'
  }
}

function startsGroup(index: number): boolean {
  return grouped.value && filtered.value[index - 1]?.group !== filtered.value[index]?.group
}

function edit(event: Event): void {
  text.value = (event.target as HTMLInputElement).value
  open.value = true
}

function showOptions(): void {
  open.value = true
  const current = filtered.value.findIndex((option) => option.symbol === normalized.value)
  activeIndex.value = Math.max(0, current >= 0 ? current : bestOptionIndex(filtered.value, ''))
}

function move(delta: number): void {
  if (!open.value) showOptions()
  const count = filtered.value.length
  if (!count) return
  activeIndex.value = (activeIndex.value + delta + count) % count
  nextTick(() =>
    document.getElementById(optionId(activeIndex.value))?.scrollIntoView({ block: 'nearest' }),
  )
}

// Applies a selection; returns whether the ticket's market changed.
function commit(event: MarketPickerEvent): boolean {
  const symbol = marketPickerCommit(text.value, model.value, selectable.value, event)
  if (symbol === null) return false
  model.value = symbol
  text.value = display(symbol)
  return true
}

function pick(option: MarketPickerOption): void {
  if (!option.selectable) return
  commit({ kind: 'pick', symbol: option.symbol })
  // Picking the market already selected still settles the text.
  text.value = display(model.value)
  open.value = false
}

function revert(): void {
  text.value = display(model.value)
}

function keydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    const highlighted = open.value ? activeOption.value : null
    // Enter in a settled field still submits the form.
    if (!pending.value && highlighted === null) return
    event.preventDefault()
    if (highlighted !== null) {
      pick(highlighted)
      return
    }
    if (commit({ kind: 'enter', highlighted: null })) open.value = false
  } else if (event.key === 'Escape') {
    event.preventDefault()
    open.value = false
    revert()
  }
}

function focusin(): void {
  focused.value = true
}

function blur(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return
  focused.value = false
  open.value = false
  commit({ kind: 'blur' })
  text.value = pending.value ? text.value.trim() : display(model.value)
}

function optionId(index: number): string {
  return `${listboxId}-option-${index}`
}
</script>

<template>
  <span class="market-combobox" @focusin="focusin" @focusout="blur">
    <input
      ref="input"
      :value="text"
      class="input market-combobox-input"
      :class="{ 'has-hint': showHint }"
      role="combobox"
      :aria-label="ariaLabel"
      aria-autocomplete="list"
      :aria-controls="listboxId"
      :aria-expanded="open"
      :aria-activedescendant="open && activeOption ? optionId(activeIndex) : undefined"
      autocomplete="off"
      spellcheck="false"
      required
      @input="edit"
      @focus="showOptions"
      @click="showOptions"
      @keydown="keydown"
    />
    <span v-if="showHint" class="market-combobox-hint" aria-hidden="true">
      press Enter to select
    </span>
    <button
      class="market-combobox-toggle"
      type="button"
      tabindex="-1"
      :aria-label="open ? 'Close market list' : 'Show markets'"
      @mousedown.prevent
      @click="open ? (open = false) : showOptions()"
    >
      <LoaderCircle v-if="loading" :size="13" class="market-combobox-spinner" />
      <ChevronDown v-else :size="13" />
    </button>

    <span v-if="open" :id="listboxId" class="market-combobox-list" role="listbox">
      <template v-for="(option, index) in filtered" :key="option.symbol">
        <span v-if="startsGroup(index)" class="market-combobox-group" role="presentation">
          {{ groupLabel(option.group) }}
        </span>
        <button
          :id="optionId(index)"
          class="market-combobox-option"
          :class="{ active: index === activeIndex, disabled: !option.selectable }"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="option.symbol === normalized"
          :aria-disabled="!option.selectable"
          :title="option.selectable ? undefined : (option.note ?? undefined)"
          @mousedown.prevent
          @mouseenter="activeIndex = index"
          @click="pick(option)"
        >
          <strong>
            {{ option.venueSymbol }}
            <span v-if="option.group !== 'main'" class="market-dex-tag">{{ option.group }}</span>
          </strong>
          <span class="market-combobox-note">{{
            option.note ?? `${account?.exchange} · ${account?.network}`
          }}</span>
        </button>
      </template>
      <span v-if="loading" class="market-combobox-state">Loading markets…</span>
      <span v-else-if="loadError" class="market-combobox-state">
        Catalog unavailable. Manual entry still works.
      </span>
      <span v-else-if="filtered.length === 0" class="market-combobox-state">
        No matching market
      </span>
    </span>
  </span>
</template>

<style scoped>
.market-combobox {
  position: relative;
  display: block;
  min-width: 0;
}
.market-combobox-input {
  width: 100%;
  padding-right: 2rem;
}
.market-combobox-input.has-hint {
  padding-right: 9.5rem;
}
.market-combobox-hint {
  position: absolute;
  z-index: 1;
  top: 50%;
  right: 38px;
  color: var(--fg-muted);
  font-size: 10px;
  pointer-events: none;
  transform: translateY(-50%);
  white-space: nowrap;
}
.market-combobox-toggle {
  position: absolute;
  z-index: 2;
  top: 1px;
  right: 1px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--fg-muted);
  background: transparent;
  border: 0;
  border-left: 1px solid var(--border-subtle);
}
.market-combobox-toggle:hover {
  color: var(--fg-strong);
  background: var(--surface-active);
}
.market-combobox-spinner {
  animation: market-combobox-spin 0.8s linear infinite;
}
.market-combobox-list {
  position: absolute;
  z-index: 80;
  top: calc(100% + 3px);
  right: 0;
  left: 0;
  display: flex;
  max-height: 230px;
  overflow-y: auto;
  flex-direction: column;
  padding: 3px;
  background: var(--surface-raised);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-lg);
}
.market-combobox-option {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.35rem 0.55rem;
  color: var(--fg);
  text-align: left;
  background: transparent;
  border: 0;
}
.market-combobox-option.active {
  color: var(--accent-color);
  background: var(--surface-active);
  box-shadow: inset 2px 0 var(--accent-color);
}
.market-combobox-option strong {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-weight: 500;
}
.market-combobox-option.disabled {
  color: var(--fg-muted);
  cursor: not-allowed;
  opacity: 0.6;
}
.market-combobox-note {
  overflow: hidden;
  max-width: 65%;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.market-combobox-group {
  padding: 0.4rem 0.55rem 0.2rem;
  color: var(--fg-muted);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.market-combobox-option .market-dex-tag {
  padding: 0 0.3rem;
  color: var(--accent-color);
  font-size: 9px;
  font-weight: 500;
  border: 1px solid color-mix(in srgb, var(--accent-color) 45%, transparent);
}
.market-combobox-option span {
  color: var(--fg-muted);
  font-size: 10px;
}
.market-combobox-state {
  padding: 0.65rem 0.55rem;
  color: var(--fg-muted);
  font-size: 11px;
}
@keyframes market-combobox-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
