<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick, onBeforeUpdate } from 'vue'
import { storeToRefs } from 'pinia'
import type { UserCommandPayload } from '@/lib/ws/protocol'
import { X } from 'lucide-vue-next'
import { commandRegistry, type CommandMeta } from '@/components/terminal/commands/commandRegistry'
import { useWsStore } from '@/stores/ws'
import { useModalStore } from '@/stores/modals'
import { createLogger } from '@/lib/utils'

const logger = createLogger('commands')

const ws = useWsStore()
const store = useModalStore()
const { modalStack } = storeToRefs(store)

// Simple command registry (incremental build-out). Each entry describes a user command
// with a key (protocol kind), human label, optional description, and whether it opens a modal.
// Central registry reference
const allCommands = ref<CommandMeta[]>(commandRegistry)
const showMenu = ref(false)
const filter = ref('')
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

const isMac = computed(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform))
const shortcutLabel = computed(() => (isMac.value ? '⌘+K' : 'Ctrl+K'))

// Quick submit for non-modal commands
function submitQuick(cmd: CommandMeta) {
  if (cmd.modal) {
    closePalette()
    store.openModal(cmd.kind)
    return
  }
  // Map of zero-data commands
  const zeroDataKinds: Array<UserCommandPayload['kind']> = [
    'ListDevices',
    'CancelAllDevicesCommand',
  ]
  if (zeroDataKinds.includes(cmd.kind as UserCommandPayload['kind'])) {
    const payload = { kind: cmd.kind as UserCommandPayload['kind'], data: undefined } as Extract<
      UserCommandPayload,
      { data: undefined }
    >
    ws.sendUserCommand(payload)
  } else {
    logger.warn('Unhandled quick command kind without modal', cmd.kind)
  }
  filter.value = ''
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
    if (modalStack.value.length) return
    e.preventDefault()
    if (showMenu.value) {
      closePalette()
    } else {
      openPalette()
    }
  }
  if (e.key === 'Escape') {
    if (modalStack.value.length) return
    if (showMenu.value) return closePalette()
  }
}
window.addEventListener('keydown', onKey)
// Re-enable hover when the mouse actually moves (not just scroll causing reflow)
function onMouseMove() {
  if (!hoverEnabled.value) hoverEnabled.value = true
}
window.addEventListener('mousemove', onMouseMove)

// Ensure the command palette yields to dedicated modals
watch(modalStack, (stack) => {
  if (stack.length && showMenu.value) {
    closePalette()
  }
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousemove', onMouseMove)
})
</script>

<template>
  <div class="items-center gap-2">
    <slot name="trigger">
      <button class="btn btn-ghost" @click="showMenu = !showMenu">
        Commands <span class="kbd">{{ shortcutLabel }}</span>
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
          class="absolute top-[10%] left-1/2 -translate-x-1/2 w-[min(640px,90%)] bg-[var(--panel-bg)] border border-[var(--border-color)] shadow-2xl text-[color:var(--color-text)] overflow-hidden"
          :style="{ borderRadius: 'var(--radius-none)' }"
        >
          <div class="relative p-2 border-b border-[var(--border-color)] flex items-center gap-2">
            <input
              id="cmd-filter"
              v-model="filter"
              placeholder="Search commands..."
              class="flex-1 bg-transparent border border-[var(--border-color)] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] placeholder:opacity-60"
              :style="{ borderRadius: 'var(--radius-input)' }"
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
              <X :size="12" />
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
  </div>
</template>

<!-- Converted to Tailwind utility classes; component no longer needs scoped CSS -->
