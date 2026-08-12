<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { X } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'

import { useAccountsStore } from '@/stores/accounts'
import { useModalStore } from '@/stores/modals'

interface EngineCommandOption {
  modal: string
  label: string
  description: string
  aliases: string[]
  danger?: boolean
}

const commands: EngineCommandOption[] = [
  {
    modal: 'EngineMarketOrder',
    label: 'Market Order',
    description: 'Submit a market order with optional exchange protection',
    aliases: ['mo'],
  },
  {
    modal: 'EngineLimitOrder',
    label: 'Limit Order',
    description: 'Place a resting or post-only limit order',
    aliases: ['lo'],
  },
  {
    modal: 'EngineChaseOrder',
    label: 'Chase Order',
    description: 'Follow the same-side top of book with a post-only order',
    aliases: ['chase'],
  },
  {
    modal: 'EngineTrailingEntry',
    label: 'Trailing Entry',
    description: 'Track market movement and enter after the configured reversal',
    aliases: ['te'],
  },
  {
    modal: 'EngineCancelEntryWork',
    label: 'Cancel Entry Work',
    description: 'Cancel waiting entry orders without closing established exposure',
    aliases: ['ca', 'cancel'],
    danger: true,
  },
  {
    modal: 'EngineFlatten',
    label: 'Flatten Exposure',
    description: 'Reduce-only flatten one symbol or the entire selected account',
    aliases: ['fp', 'fl'],
    danger: true,
  },
]

const accounts = useAccountsStore()
const modals = useModalStore()
const { modalStack } = storeToRefs(modals)
const open = ref(false)
const filter = ref('')
const activeIndex = ref(0)

const filtered = computed(() => {
  const query = filter.value.trim().toLowerCase()
  if (query === '') return commands
  return commands
    .filter((command) =>
      [command.label, command.modal, ...command.aliases].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
    .sort(
      (left, right) => Number(right.aliases.includes(query)) - Number(left.aliases.includes(query)),
    )
})
const isMac = computed(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform))
const shortcut = computed(() => (isMac.value ? '⌘+K' : 'Ctrl+K'))

watch(filtered, (options) => {
  if (activeIndex.value >= options.length) activeIndex.value = Math.max(0, options.length - 1)
})

watch(modalStack, (stack) => {
  if (stack.length > 0) close()
})

function show(): void {
  open.value = true
  filter.value = ''
  activeIndex.value = 0
  nextTick(() => document.querySelector<HTMLInputElement>('[data-engine-command-filter]')?.focus())
}

function close(): void {
  open.value = false
}

function toggle(): void {
  if (open.value) close()
  else show()
}

function move(delta: number): void {
  if (filtered.value.length === 0) return
  activeIndex.value = (activeIndex.value + delta + filtered.value.length) % filtered.value.length
}

function choose(command: EngineCommandOption | undefined): void {
  if (command === undefined || accounts.accounts.length === 0) return
  close()
  modals.openModal(command.modal)
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    if (modalStack.value.length > 0) return
    event.preventDefault()
    toggle()
    return
  }
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div>
    <button class="btn btn-ghost" type="button" @click="toggle">
      Commands <span class="kbd">{{ shortcut }}</span>
    </button>

    <Teleport to="body">
      <div v-if="open" class="palette-backdrop" @click.self="close">
        <section class="command-palette" role="dialog" aria-label="Commands">
          <div class="filter-row">
            <input
              v-model="filter"
              data-engine-command-filter
              class="input command-filter"
              placeholder="Search commands"
              autocomplete="off"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="choose(filtered[activeIndex])"
            />
            <button
              v-if="filter"
              class="btn icon-btn"
              type="button"
              title="Clear search"
              @click="filter = ''"
            >
              <X :size="12" />
            </button>
          </div>
          <div v-if="accounts.accounts.length === 0" class="palette-notice">
            Add a trading account before submitting commands.
          </div>
          <div class="command-grid">
            <button
              v-for="(command, index) in filtered"
              :key="command.modal"
              class="command-option"
              :class="{ active: index === activeIndex, danger: command.danger }"
              type="button"
              :disabled="accounts.accounts.length === 0"
              @mouseenter="activeIndex = index"
              @click="choose(command)"
            >
              <span class="command-label">{{ command.label }}</span>
              <span class="command-description">{{ command.description }}</span>
              <span class="aliases">
                <span v-for="alias in command.aliases" :key="alias">{{ alias }}</span>
              </span>
            </button>
            <div v-if="filtered.length === 0" class="palette-empty">No matching commands</div>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 400;
  padding: 5vh 12px;
  background: rgb(0 0 0 / 25%);
  backdrop-filter: blur(2px);
}
.command-palette {
  width: min(960px, 100%);
  max-height: 90vh;
  margin: 0 auto;
  overflow: hidden;
  color: var(--color-text);
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 12px 40px rgb(0 0 0 / 45%);
}
.filter-row {
  display: flex;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
}
.command-filter {
  min-width: 0;
  flex: 1;
}
.palette-notice,
.palette-empty {
  padding: 12px;
  color: var(--color-text-dim);
}
.command-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-height: min(78vh, 720px);
  overflow: auto;
}
.command-option {
  display: flex;
  min-height: 86px;
  flex-direction: column;
  gap: 5px;
  padding: 12px;
  color: var(--color-text);
  text-align: left;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}
.command-option.active {
  background: var(--color-bg-hover);
}
.command-option.danger .command-label {
  color: var(--color-error);
}
.command-option:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.command-label {
  font-size: 13px;
}
.command-description {
  color: var(--color-text-dim);
  font-size: 11px;
}
.aliases {
  display: flex;
  gap: 4px;
  margin-top: auto;
  color: var(--color-accent);
  font-size: 10px;
}
.aliases span {
  padding: 1px 4px;
  border: 1px solid var(--border-color);
}
.palette-empty {
  grid-column: 1 / -1;
  text-align: center;
}
@media (max-width: 680px) {
  .command-grid {
    grid-template-columns: 1fr;
  }
}
</style>
