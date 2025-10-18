<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'
import type { UserCommandPayload } from '@/lib/ws/protocol'
import MarketOrderModal from '@/components/terminal/modals/MarketOrderModal.vue'
import LimitOrderModal from '@/components/terminal/modals/LimitOrderModal.vue'
import TrailingEntryOrderModal from '@/components/terminal/modals/TrailingEntryOrderModal.vue'
import SplitMarketOrderModal from '@/components/terminal/modals/SplitMarketOrderModal.vue'
import { commandRegistry, type CommandMeta } from '@/components/terminal/commands/commandRegistry'

// Store
const ws = useWsStore()

// Simple command registry (incremental build-out). Each entry describes a user command
// with a key (protocol kind), human label, optional description, and whether it opens a modal.
// Central registry reference
const allCommands = ref<CommandMeta[]>(commandRegistry)

const filter = ref('')
const showMenu = ref(false)
const activeModal = ref<CommandMeta | null>(null)

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
    ws.sendUserCommand(payload)
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

// Keyboard handlers: open palette with Ctrl+K / Cmd+K
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    showMenu.value = !showMenu.value
    if (showMenu.value)
      setTimeout(
        () => (document.getElementById('cmd-filter') as HTMLInputElement | null)?.focus(),
        0,
      )
  }
  if (e.key === 'Escape') {
    if (activeModal.value) {
      closeActiveModal()
      return
    }
    if (showMenu.value) {
      showMenu.value = false
      return
    }
  }
}
window.addEventListener('keydown', onKey)
</script>

<template>
  <div class="command-input relative">
    <button class="btn btn-secondary btn-sm" @click="showMenu = !showMenu">Commands</button>
    <span class="ml-2 dim text-[11px]">(⌘+K)</span>

    <!-- Command palette popup -->
    <Teleport to="body">
      <div v-if="showMenu" class="fixed inset-0 z-[400]" @click.self="showMenu = false">
        <div class="palette-card">
          <div class="p-2 border-b border-[var(--border-color)] flex items-center gap-2">
            <input
              id="cmd-filter"
              v-model="filter"
              placeholder="Search commands..."
              class="input flex-1"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="btn btn-secondary btn-xs" @click="showMenu = false">Close</button>
          </div>
          <div class="max-h-80 overflow-auto">
            <ul>
              <li
                v-for="c in filteredCommands"
                :key="c.kind"
                class="cmd-item"
                @click="submitQuick(c)"
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

<style scoped>
.command-input {
  padding: 0.5rem;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.palette-card {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, 90%);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  color: var(--color-text);
}
.cmd-item {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
  cursor: pointer;
}
.cmd-item:hover {
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
}

/* Modal styles removed; handled by dedicated modal components */
</style>
