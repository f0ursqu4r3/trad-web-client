<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick, onBeforeUpdate } from 'vue'
import { useWsStore } from '@/stores/ws'
import type { UserCommandPayload } from '@/lib/ws/protocol'
import { XIcon } from '@/components/icons'
import { commandRegistry, type CommandMeta } from '@/components/terminal/commands/commandRegistry'

import MarketOrderModal from '@/components/terminal/modals/MarketOrderModal.vue'
import LimitOrderModal from '@/components/terminal/modals/LimitOrderModal.vue'
import TrailingEntryOrderModal from '@/components/terminal/modals/TrailingEntryOrderModal.vue'
import SplitMarketOrderModal from '@/components/terminal/modals/SplitMarketOrderModal.vue'

// Store
const ws = useWsStore()

// Simple command registry (incremental build-out). Each entry describes a user command
// with a key (protocol kind), human label, optional description, and whether it opens a modal.
// Central registry reference
const allCommands = ref<CommandMeta[]>(commandRegistry)

const filter = ref('')
const showMenu = ref(false)
const activeModal = ref<CommandMeta | null>(null)
const activeIndex = ref(0)
// When navigating with keyboard we temporarily ignore mouse hover until the user moves the mouse
const hoverEnabled = ref(true)
// Refs to each rendered command list item for scroll management
const itemRefs = ref<HTMLElement[]>([])
onBeforeUpdate(() => {
  // reset before Vue re-renders the v-for so we capture fresh refs
  itemRefs.value = []
})

const filteredCommands = computed(() => {
  const f = filter.value.trim().toLowerCase()
  if (!f) return allCommands.value
  return allCommands.value.filter(
    (c) => c.label.toLowerCase().includes(f) || c.kind.toLowerCase().includes(f),
  )
})

// Quick submit for non-modal commands
function submitQuick(cmd: CommandMeta) {
  if (cmd.modal) {
    activeModal.value = cmd
    return
  }
  // Map of zero-data commands
  const zeroDataKinds: Array<UserCommandPayload['kind']> = [
    'GetBalance',
    'ListDevices',
    'ListPositions',
    'CancelAllDevicesCommand',
    'GetUserInfo',
  ]
  if (zeroDataKinds.includes(cmd.kind as UserCommandPayload['kind'])) {
    const payload = { kind: cmd.kind as UserCommandPayload['kind'], data: undefined } as Extract<
      UserCommandPayload,
      { data: undefined }
    >
    ws.sendUserCommand(payload, `/${cmd.kind}`)
  } else {
    console.warn('Unhandled quick command kind without modal', cmd.kind)
  }
  showMenu.value = false
  filter.value = ''
}

// Individual modal state handlers now live inside dedicated modal components

function closeActiveModal() {
  activeModal.value = null
}

function openPalette() {
  showMenu.value = true
  activeIndex.value = 0
  hoverEnabled.value = true
  nextTick(() => (document.getElementById('cmd-filter') as HTMLInputElement | null)?.focus())
}

function closePalette() {
  showMenu.value = false
}

function moveSelection(delta: number) {
  const list = filteredCommands.value
  if (!list.length) return
  const len = list.length
  activeIndex.value = (activeIndex.value + delta + len) % len
  // Disable hover until user moves the mouse intentionally
  hoverEnabled.value = false
}

function selectActive() {
  const list = filteredCommands.value
  if (!list.length) return
  const cmd = list[activeIndex.value]
  if (cmd) submitQuick(cmd)
}

// Keep active index in range if filter result shrinks
watch(filteredCommands, (list) => {
  if (activeIndex.value >= list.length) activeIndex.value = list.length ? list.length - 1 : 0
})

// Scroll newly focused (active) item into view when navigating with keyboard
watch(activeIndex, () => {
  nextTick(() => {
    const el = itemRefs.value[activeIndex.value]
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  })
})

// Keyboard handlers: open palette with Ctrl+K / Cmd+K
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (showMenu.value) {
      closePalette()
    } else {
      openPalette()
    }
  }
  if (e.key === 'Escape') {
    if (activeModal.value) return closeActiveModal()
    if (showMenu.value) return closePalette()
  }
}
window.addEventListener('keydown', onKey)
// Re-enable hover when the mouse actually moves (not just scroll causing reflow)
function onMouseMove() {
  if (!hoverEnabled.value) hoverEnabled.value = true
}
window.addEventListener('mousemove', onMouseMove)
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousemove', onMouseMove)
})
</script>

<template>
  <div class="items-center gap-2">
    <slot name="trigger">
      <button class="btn btn-ghost" @click="showMenu = !showMenu">
        Commands <span class="kbd">⌘+K</span>
      </button>
    </slot>

    <!-- Command palette popup -->
    <Teleport to="body">
      <div
        v-if="showMenu"
        class="fixed inset-0 z-[400] bg-black/25 backdrop-blur-xs"
        @click.self="showMenu = false"
      >
        <div
          class="absolute top-[10%] left-1/2 -translate-x-1/2 w-[min(640px,90%)] bg-[var(--panel-bg)] border border-[var(--border-color)] rounded-lg shadow-2xl text-[color:var(--color-text)] overflow-hidden"
        >
          <div class="relative p-2 border-b border-[var(--border-color)] flex items-center gap-2">
            <input
              id="cmd-filter"
              v-model="filter"
              placeholder="Search commands..."
              class="flex-1 bg-transparent border border-[var(--border-color)] rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] placeholder:opacity-60"
              autocomplete="off"
              spellcheck="false"
              @keydown.down.prevent="moveSelection(1)"
              @keydown.up.prevent="moveSelection(-1)"
              @keydown.enter.prevent="selectActive()"
            />
            <button
              v-show="filter.length > 0"
              class="btn btn-ghost btn-sm absolute right-2 top-1/2 transform -translate-y-1/2"
              @click="filter = ''"
            >
              <XIcon />
            </button>
          </div>
          <div class="max-h-80 overflow-auto scroll-smooth">
            <ul>
              <li
                v-for="(c, i) in filteredCommands"
                :key="c.kind"
                :ref="(el) => (itemRefs[i] = el as HTMLElement)"
                class="p-2 px-3 border-b border-[var(--border-color)] cursor-pointer transition-colors"
                :class="[
                  i === activeIndex
                    ? 'bg-[color-mix(in_srgb,var(--panel-header-bg)_80%,transparent)]'
                    : 'hover:bg-[color-mix(in_srgb,var(--panel-header-bg)_60%,transparent)]',
                ]"
                role="option"
                :aria-selected="i === activeIndex"
                @click="submitQuick(c)"
                @mouseenter="hoverEnabled && (activeIndex = i)"
              >
                <div class="font-medium">{{ c.label }}</div>
                <div class="text-[11px] dim" v-if="c.description">{{ c.description }}</div>
                <div class="text-[10px] mt-1 mono text-[var(--accent-color)]">{{ c.kind }}</div>
              </li>
              <li v-if="!filteredCommands.length" class="p-3 text-[12px] text-center dim">
                No matches
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Teleport>

    <MarketOrderModal :open="activeModal?.kind === 'MarketOrder'" @close="closeActiveModal" />
    <LimitOrderModal :open="activeModal?.kind === 'LimitOrder'" @close="closeActiveModal" />
    <TrailingEntryOrderModal
      :open="activeModal?.kind === 'TrailingEntryOrder'"
      @close="closeActiveModal"
    />
    <SplitMarketOrderModal
      :open="activeModal?.kind === 'SplitMarketOrder'"
      @close="closeActiveModal"
    />
  </div>
</template>

<!-- Converted to Tailwind utility classes; component no longer needs scoped CSS -->
