<script setup lang="ts">
import { ref, computed, type Component } from 'vue'
import StickyScroller from '@/components/general/StickyScroller.vue'
import { useCommandStore } from '@/stores/command'
import { useModalStore } from '@/stores/modals'

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
    return
  }
  if (has) {
    commandStore.commandFilters[group] = list.filter((item) => item !== option)
  } else {
    commandStore.commandFilters[group] = [...list, option as never]
  }
}

function isFilterActive(group: 'kind' | 'status' | 'position', option: string) {
  return commandStore.commandFilters[group].includes(option as never)
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
                class="btn btn-sm btn-ghost"
                :data-pressed="isFilterActive('status', option)"
                :aria-pressed="isFilterActive('status', option)"
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
                class="btn btn-sm btn-ghost"
                :data-pressed="isFilterActive('position', option)"
                :aria-pressed="isFilterActive('position', option)"
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
                class="btn btn-sm btn-ghost"
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
                class="btn btn-sm btn-ghost"
                :data-pressed="isFilterActive('kind', option)"
                :aria-pressed="isFilterActive('kind', option)"
                @click="toggleMultiFilter('kind', option, $event)"
              >
                {{ option }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <StickyScroller
      :trigger="commandStore.filteredCommands.length"
      :smooth="true"
      :showButton="true"
      class="flex-1 min-h-0"
    >
      <div class="flex flex-col p-2 gap-2">
        <template v-for="cmd in commandStore.filteredCommands" :key="cmd.command_id">
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
              :createdAt="cmd.created_at"
              @duplicate="handleDuplicate(cmd.command)"
              @cancel="handleCancel"
              @inspect="handleInspect"
              @close-position="handleClosePosition"
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
</style>
