<script setup lang="ts">
import { ref, computed, type Component, nextTick } from 'vue'
import SplitView from '@/components/general/SplitView.vue'
import StickyScroller from '@/components/general/StickyScroller.vue'
import { useCommandStore } from '@/stores/command'
import { useModalStore } from '@/stores/modals'
import { formatName } from '@/lib/utils'

import type { MarketOrderPrefill, TrailingEntryPrefill } from '../modals/commands/types'
import type { UserCommandPayload } from '@/lib/ws/protocol'
import { interestingCommandKinds } from '@/stores/command'

import CommandHistoryItem from '@/components/terminal/commands/CommandHistoryItem.vue'
import CommandBase from '../commands/CommandBase.vue'
import TELongCommand from '@/components/terminal/commands/TELongCommand.vue'
import MarketOrderCommand from '@/components/terminal/commands/MarketOrderCommand.vue'

defineOptions({
  inheritAttrs: false,
})

const commandStore = useCommandStore()
const modalStore = useModalStore()

const showFilters = ref(false)

function toggleFilters() {
  showFilters.value = !showFilters.value
}

defineExpose({
  showFilters,
  toggleFilters,
  hiddenCommandCount: computed(
    () => commandStore.commands.length - commandStore.filteredCommands.length,
  ),
  shownCommandCount: computed(() => commandStore.filteredCommands.length),
})

const hiddenCommandCount = computed(
  () => commandStore.commands.length - commandStore.filteredCommands.length,
)

const pinnedCommands = computed(() => {
  return commandStore.commands.filter((cmd) => commandStore.commandMeta?.[cmd.command_id]?.pinned)
})

const unpinnedCommands = computed(() => {
  return commandStore.filteredCommands.filter(
    (cmd) => !commandStore.commandMeta?.[cmd.command_id]?.pinned,
  )
})

const statusOptions = ['Running', 'Completed', 'Failed', 'Canceled'] as const
const positionOptions = ['Open', 'Closed', 'Dusted'] as const
const timeOptions = [
  { label: 'Any', value: 'Any' },
  { label: '12h', value: '12h' },
  { label: 'Day', value: 'Day' },
  { label: 'Week', value: 'Week' },
  { label: 'Month', value: 'Month' },
] as const

function toggleMultiFilter(
  group: 'kind' | 'status' | 'position',
  option: string,
  event?: MouseEvent,
) {
  const list = commandStore.commandFilters[group]
  const has = list.includes(option as never)
  if (event?.shiftKey) {
    commandStore.commandFilters[group] = [option as never]
    commandStore.commandFilters.solo[group] = true
    return
  }
  if (has) {
    commandStore.commandFilters[group] = list.filter((item) => item !== option)
  } else {
    commandStore.commandFilters[group] = [...list, option as never]
  }
  if (commandStore.commandFilters[group].length !== 1) {
    commandStore.commandFilters.solo[group] = false
  }
}

function isFilterActive(group: 'kind' | 'status' | 'position', option: string) {
  return commandStore.commandFilters[group].includes(option as never)
}

function isSoloActive(group: 'kind' | 'status' | 'position', option: string) {
  return commandStore.commandFilters.solo[group] && isFilterActive(group, option)
}

function setTimeRange(value: string) {
  commandStore.commandFilters.timeRange = value as any
}

function getCommandComponent(command: UserCommandPayload): Component | string {
  switch (command.kind) {
    case 'MarketOrder':
      return MarketOrderCommand
    case 'TrailingEntryOrder':
      return TELongCommand
    default:
      return 'div'
  }
}

function getCommandLabel(command: UserCommandPayload): string {
  if (command.kind === 'TrailingEntryOrder') return 'Trailing Entry'
  return command.kind
}

function getKindLabel(kind: string): string {
  if (kind === 'TrailingEntryOrder') return 'Trailing Entry'
  return formatName(kind)
}

function handleDuplicate(command: UserCommandPayload): void {
  switch (command.kind) {
    case 'TrailingEntryOrder':
      modalStore.openModalWithValues('TrailingEntryOrder', {
        activation_price: command.data.activation_price,
        jump_frac_threshold: command.data.jump_frac_threshold,
        position_side: command.data.position_side,
        risk_amount: command.data.risk_amount,
        stop_loss: command.data.stop_loss,
        symbol: command.data.symbol,
      } as TrailingEntryPrefill)
      break
    case 'MarketOrder':
      modalStore.openModalWithValues('MarketOrder', {
        symbol: command.data.symbol,
        quantity_usd: command.data.quantity_usd,
        position_side: command.data.position_side,
        action: command.data.action,
      } as MarketOrderPrefill)
      break
    default:
      break
  }
}

function handleInspect(commandId: string): void {
  commandStore.inspectCommand(commandId)
}

function handleCancel(commandId: string): void {
  commandStore.cancelCommand(commandId)
}

function handleClosePosition(commandId: string): void {
  const cmd = commandStore.commandMap[commandId]
  if (!cmd || cmd.command.kind !== 'TrailingEntryOrder') return
  commandStore.closePosition(commandId)
}

function handleRename(commandId: string): void {
  const current = commandStore.commandMeta?.[commandId]?.nickname ?? ''
  const currentColor = commandStore.commandMeta?.[commandId]?.nicknameColor ?? null
  renameCommandId.value = commandId
  renameValue.value = current
  renameColor.value = currentColor
  renameOpen.value = true
  nextTick(() => {
    const el = document.getElementById('command-nickname-input') as HTMLInputElement | null
    el?.focus()
    el?.select()
  })
}

function handlePin(commandId: string): void {
  commandStore.toggleCommandPin(commandId)
}

const renameOpen = ref(false)
const renameCommandId = ref<string | null>(null)
const renameValue = ref('')
const renameColor = ref<string | null>(null)
const nicknameColors = [
  { label: 'Default', value: null },
  { label: 'Blue', value: '#5cc8ff' },
  { label: 'Green', value: '#6ee7b7' },
  { label: 'Yellow', value: '#fbbf24' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Red', value: '#f87171' },
  { label: 'Purple', value: '#a78bfa' },
  { label: 'Pink', value: '#f472b6' },
]

const renameCommandLabel = computed(() => {
  if (!renameCommandId.value) return ''
  const cmd = commandStore.commandMap[renameCommandId.value]
  if (!cmd) return ''
  return getCommandLabel(cmd.command)
})

function closeRename() {
  renameOpen.value = false
  renameCommandId.value = null
  renameValue.value = ''
  renameColor.value = null
}

function saveRename() {
  if (!renameCommandId.value) return
  commandStore.setCommandNickname(renameCommandId.value, renameValue.value, renameColor.value)
  closeRename()
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <Transition name="expand">
      <div v-show="showFilters">
        <div class="panel-content space-y-3 p-2 text-xs">
          <div class="space-y-2">
            <div class="flex items-center justify-between text-[11px] uppercase tracking-wide text-(--color-text-dim)">
              <span>Status</span>
              <span class="text-[10px] normal-case">Shift+click to solo</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in statusOptions"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('status', option)"
                :aria-pressed="isFilterActive('status', option)"
                :class="isSoloActive('status', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('status', option, $event)"
              >
                {{ option }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Position</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in positionOptions"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('position', option)"
                :aria-pressed="isFilterActive('position', option)"
                :class="isSoloActive('position', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('position', option, $event)"
              >
                {{ option }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Recent</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in timeOptions"
                :key="option.value"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="commandStore.commandFilters.timeRange === option.value"
                :aria-pressed="commandStore.commandFilters.timeRange === option.value"
                @click="setTimeRange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">Kind</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in commandStore.activeCommandKinds"
                :key="option"
                class="btn btn-sm btn-ghost filter-btn"
                :data-pressed="isFilterActive('kind', option)"
                :aria-pressed="isFilterActive('kind', option)"
                :class="isSoloActive('kind', option) ? 'filter-solo' : ''"
                @click="toggleMultiFilter('kind', option, $event)"
              >
                {{ getKindLabel(option) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="pinnedCommands.length" class="flex-1 min-h-0">
      <SplitView
        orientation="vertical"
        storage-key="terminal-commands-pinned"
        :initial-sizes="[35, 65]"
        class="w-full h-full"
      >
      <template #pinned>
        <div class="pane-fill">
          <div class="pinned-section flex-1 min-h-0">
            <div class="pinned-header">Pinned</div>
            <div class="pinned-body">
              <StickyScroller :trigger="pinnedCommands.length" :smooth="true" :showButton="false">
                <div class="flex flex-col p-2 gap-2">
                  <template v-for="cmd in pinnedCommands" :key="cmd.command_id">
                    <div
                      class="border border-[var(--border-color)]"
                      :class="
                        cmd.command_id == commandStore.selectedCommandId
                          ? 'ring-2 ring-[var(--color-text)]'
                          : ''
                      "
                    >
                      <CommandBase
                        v-if="Object.values(interestingCommandKinds).includes(cmd.command.kind)"
                        :commandId="cmd.command_id"
                        :commandStatus="cmd.status"
                        :commandKind="cmd.command.kind"
                        :label="getCommandLabel(cmd.command)"
                        :nickname="commandStore.commandMeta?.[cmd.command_id]?.nickname ?? null"
                        :nicknameColor="
                          commandStore.commandMeta?.[cmd.command_id]?.nicknameColor ?? null
                        "
                        :pinned="commandStore.commandMeta?.[cmd.command_id]?.pinned ?? false"
                        :createdAt="cmd.created_at"
                        @duplicate="handleDuplicate(cmd.command)"
                        @cancel="handleCancel"
                        @inspect="handleInspect"
                        @close-position="handleClosePosition"
                        @rename="handleRename"
                        @pin="handlePin"
                      >
                        <component
                          :is="getCommandComponent(cmd.command)"
                          :command="cmd.command.data"
                        />
                      </CommandBase>
                      <CommandHistoryItem v-else :command="cmd" />
                    </div>
                  </template>
                </div>
              </StickyScroller>
            </div>
          </div>
        </div>
      </template>
      <template #all>
        <div class="pane-fill">
          <StickyScroller
            :trigger="unpinnedCommands.length"
            :smooth="true"
            :showButton="true"
            class="flex-1 min-h-0"
          >
            <div class="flex flex-col p-2 gap-2">
              <template v-for="cmd in unpinnedCommands" :key="cmd.command_id">
                <div
                  class="border border-[var(--border-color)]"
                  :class="
                    cmd.command_id == commandStore.selectedCommandId
                      ? 'ring-2 ring-[var(--color-text)]'
                      : ''
                  "
                >
                  <CommandBase
                    v-if="Object.values(interestingCommandKinds).includes(cmd.command.kind)"
                    :commandId="cmd.command_id"
                    :commandStatus="cmd.status"
                    :commandKind="cmd.command.kind"
                    :label="getCommandLabel(cmd.command)"
                    :nickname="commandStore.commandMeta?.[cmd.command_id]?.nickname ?? null"
                    :nicknameColor="commandStore.commandMeta?.[cmd.command_id]?.nicknameColor ?? null"
                    :pinned="commandStore.commandMeta?.[cmd.command_id]?.pinned ?? false"
                    :createdAt="cmd.created_at"
                    @duplicate="handleDuplicate(cmd.command)"
                    @cancel="handleCancel"
                    @inspect="handleInspect"
                    @close-position="handleClosePosition"
                    @rename="handleRename"
                    @pin="handlePin"
                  >
                    <component :is="getCommandComponent(cmd.command)" :command="cmd.command.data" />
                  </CommandBase>
                  <CommandHistoryItem v-else :command="cmd" />
                </div>
              </template>
            </div>
          </StickyScroller>
        </div>
      </template>
      </SplitView>
    </div>

    <StickyScroller
      v-else
      :trigger="unpinnedCommands.length"
      :smooth="true"
      :showButton="true"
      class="flex-1 min-h-0"
    >
      <div class="flex flex-col p-2 gap-2">
        <template v-for="cmd in unpinnedCommands" :key="cmd.command_id">
          <div
            class="border border-[var(--border-color)]"
            :class="
              cmd.command_id == commandStore.selectedCommandId
                ? 'ring-2 ring-[var(--color-text)]'
                : ''
            "
          >
            <CommandBase
              v-if="Object.values(interestingCommandKinds).includes(cmd.command.kind)"
              :commandId="cmd.command_id"
              :commandStatus="cmd.status"
              :commandKind="cmd.command.kind"
              :label="getCommandLabel(cmd.command)"
              :nickname="commandStore.commandMeta?.[cmd.command_id]?.nickname ?? null"
              :nicknameColor="commandStore.commandMeta?.[cmd.command_id]?.nicknameColor ?? null"
              :pinned="commandStore.commandMeta?.[cmd.command_id]?.pinned ?? false"
              :createdAt="cmd.created_at"
              @duplicate="handleDuplicate(cmd.command)"
              @cancel="handleCancel"
              @inspect="handleInspect"
              @close-position="handleClosePosition"
              @rename="handleRename"
              @pin="handlePin"
            >
              <component :is="getCommandComponent(cmd.command)" :command="cmd.command.data" />
            </CommandBase>
            <CommandHistoryItem v-else :command="cmd" />
          </div>
        </template>
      </div>
    </StickyScroller>

    <Teleport to="body">
      <div
        v-if="renameOpen"
        class="fixed inset-0 z-[400] bg-black/25 backdrop-blur-xs"
        @click.self="closeRename"
      >
        <div
          class="absolute top-[10%] left-1/2 -translate-x-1/2 w-[min(520px,90%)] bg-[var(--panel-bg)] border border-[var(--border-color)] shadow-2xl text-[color:var(--color-text)] overflow-hidden"
          :style="{ borderRadius: 'var(--radius-none)' }"
          role="dialog"
          aria-modal="true"
        >
          <div class="relative p-3 border-b border-[var(--border-color)]">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim)">
              Command Nickname
            </div>
            <div class="text-[13px] text-(--color-text) mt-1">{{ renameCommandLabel }}</div>
            <button
              v-if="renameValue.trim().length > 0"
              class="btn btn-sm btn-ghost absolute right-3 top-3"
              @click="renameValue = ''; renameColor = null; saveRename()"
            >
              Remove
            </button>
          </div>
          <div class="p-3">
            <input
              id="command-nickname-input"
              v-model="renameValue"
              placeholder="Add a nickname..."
              class="w-full bg-transparent border border-[var(--border-color)] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] placeholder:opacity-60"
              :style="{ borderRadius: 'var(--radius-none)' }"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter.prevent="saveRename"
              @keydown.escape.prevent="closeRename"
            />
          </div>
          <div class="px-3 pb-2">
            <div class="text-[11px] uppercase tracking-wide text-(--color-text-dim) mb-2">
              Nickname color
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in nicknameColors"
                :key="option.label"
                class="btn btn-sm btn-ghost"
                :data-pressed="renameColor === option.value"
                :aria-pressed="renameColor === option.value"
                @click="renameColor = option.value"
              >
                <span
                  v-if="option.value"
                  class="inline-block w-3 h-3 border"
                  :style="{ background: option.value, borderColor: 'var(--border-color)' }"
                />
                <span v-else class="text-xs text-(--color-text-dim)">Default</span>
              </button>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 p-3 border-t border-[var(--border-color)]">
            <button class="btn btn-sm btn-ghost" @click="closeRename">Cancel</button>
            <button class="btn btn-sm" @click="saveRename">Save</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s ease;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}
.expand-enter-to,
.expand-leave-from {
  max-height: 500px;
  opacity: 1;
}

.filter-btn {
  color: var(--color-text-dim);
  border-color: var(--border-color);
  box-shadow: none;
  background: transparent;
}

.filter-btn[data-pressed='true'],
.filter-btn[aria-pressed='true'] {
  color: var(--color-text);
  border-color: var(--color-text);
  box-shadow: inset 0 0 0 1px var(--color-text);
}

.filter-solo {
  border-color: var(--color-text);
  box-shadow:
    inset 0 0 0 1px var(--color-text),
    0 0 0 1px var(--color-text);
}

.pinned-section {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border-color);
}

.pinned-header {
  padding: 6px 10px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-dim);
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  border-bottom: 1px solid var(--border-color);
}
.pinned-body {
  flex: 1;
  min-height: 0;
}

.pane-fill {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
</style>
