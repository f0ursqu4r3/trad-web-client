<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronDown, LoaderCircle } from 'lucide-vue-next'

import { loadMarketSymbols } from '@/lib/marketCatalog'
import type { AccountRecord } from '@/stores/accounts'

const props = withDefaults(defineProps<{ account: AccountRecord | null; ariaLabel?: string }>(), {
  ariaLabel: 'Market',
})
const emit = defineEmits<{ validity: [error: string | null] }>()
const model = defineModel<string>({ required: true })

let nextComboboxId = 0
const listboxId = `market-symbols-${++nextComboboxId}`
const input = ref<HTMLInputElement | null>(null)
const symbols = ref<string[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const open = ref(false)
const activeIndex = ref(0)

const normalized = computed(() => model.value.trim().toUpperCase())
const filtered = computed(() => {
  const query = normalized.value
  const ranked = symbols.value
    .filter((symbol) => !query || symbol.includes(query))
    .sort((a, b) => Number(b.startsWith(query)) - Number(a.startsWith(query)) || a.localeCompare(b))
  return ranked.slice(0, 12)
})
const activeSymbol = computed(() => filtered.value[activeIndex.value] ?? null)
const validity = computed(() => {
  if (!normalized.value || loading.value || loadError.value || symbols.value.length === 0)
    return null
  return symbols.value.includes(normalized.value)
    ? null
    : `${normalized.value} is not available for this account`
})

watch(
  () => props.account,
  async (account) => {
    symbols.value = []
    loadError.value = null
    open.value = false
    if (!account) return

    loading.value = true
    try {
      symbols.value = await loadMarketSymbols(account)
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)
watch(filtered, () => (activeIndex.value = 0))
watch(validity, (error) => emit('validity', error), { immediate: true })

function edit(event: Event): void {
  model.value = (event.target as HTMLInputElement).value.toUpperCase()
  open.value = true
}

function showOptions(): void {
  open.value = true
  activeIndex.value = Math.max(
    0,
    filtered.value.findIndex((symbol) => symbol === normalized.value),
  )
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

function accept(symbol = activeSymbol.value): void {
  if (!symbol) return
  model.value = symbol
  open.value = false
}

function keydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter' && open.value && activeSymbol.value) {
    event.preventDefault()
    accept()
  } else if (event.key === 'Tab' && open.value && activeSymbol.value && normalized.value) {
    accept()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    open.value = false
  }
}

function blur(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && (event.currentTarget as HTMLElement).contains(next)) return
  open.value = false
  model.value = normalized.value
}

function optionId(index: number): string {
  return `${listboxId}-option-${index}`
}
</script>

<template>
  <span class="market-combobox" @focusout="blur">
    <input
      ref="input"
      :value="model"
      class="input market-combobox-input"
      role="combobox"
      :aria-label="ariaLabel"
      aria-autocomplete="list"
      :aria-controls="listboxId"
      :aria-expanded="open"
      :aria-activedescendant="open && activeSymbol ? optionId(activeIndex) : undefined"
      autocomplete="off"
      spellcheck="false"
      required
      @input="edit"
      @focus="showOptions"
      @click="showOptions"
      @keydown="keydown"
    />
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
      <button
        v-for="(symbol, index) in filtered"
        :id="optionId(index)"
        :key="symbol"
        class="market-combobox-option"
        :class="{ active: index === activeIndex }"
        type="button"
        role="option"
        :aria-selected="symbol === normalized"
        @mousedown.prevent
        @mouseenter="activeIndex = index"
        @click="accept(symbol)"
      >
        <strong>{{ symbol }}</strong>
        <span>{{ account?.exchange }} · {{ account?.network }}</span>
      </button>
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
  font-weight: 500;
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
