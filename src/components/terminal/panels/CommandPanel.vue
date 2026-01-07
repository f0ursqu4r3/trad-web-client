<script setup lang="ts">
import { ref, computed, type Component } from 'vue'
import StickyScroller from '@/components/general/StickyScroller.vue'
import { useCommandStore } from '@/stores/command'
import { useModalStore } from '@/stores/modals'
import { FunnelIcon } from '@/components/icons'

import type { MarketOrderPrefill, TrailingEntryPrefill } from '../modals/commands/types'
import type { UserCommandPayload } from '@/lib/ws/protocol'
import { interestingCommandKinds } from '@/stores/command'

import CommandHistoryItem from '@/components/terminal/commands/CommandHistoryItem.vue'
import CommandBase from '../commands/CommandBase.vue'
import TELongCommand from '@/components/terminal/commands/TELongCommand.vue'
import MarketOrderCommand from '@/components/terminal/commands/MarketOrderCommand.vue'

const commandStore = useCommandStore()
const modalStore = useModalStore()

const showFilters = ref(false)

const hiddenCommandCount = computed(() => {
  return commandStore.commands.length - commandStore.filteredCommands.length
})

function handleCheckboxChange(
  option: string,
  checkedOrEvent: boolean | Event,
  type: 'kind' | 'status',
): void {
  const checked =
    typeof checkedOrEvent === 'boolean'
      ? checkedOrEvent
      : ((checkedOrEvent.target as HTMLInputElement | null)?.checked ?? false)

  if (checked) {
    const idx = commandStore.commandFilters[type].indexOf(option as never)
    if (idx > -1) {
      commandStore.commandFilters[type].splice(idx, 1)
    }
  } else {
    commandStore.commandFilters[type].push(option as never)
  }
}

function getCommandSymbol(command: UserCommandPayload): string {
  switch (command.kind) {
    case 'MarketOrder':
    case 'TrailingEntryOrder':
      return command.data.symbol
    default:
      return ''
  }
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
  commandStore.closePosition(cmd.command.data)
}
</script>

<template>
  <div class="panel flex flex-col h-full min-h-0">
    <div class="panel-header flex flex-col">
      <div class="flex justify-end items-center gap-2">
        <span v-if="hiddenCommandCount" class="text-xs"> {{ hiddenCommandCount }} hidden </span>
        <button class="btn btn-sm btn-ghost" @click="showFilters = !showFilters">
          <FunnelIcon size="12" />
        </button>
      </div>
      <Transition name="expand">
        <div v-show="showFilters">
          <div class="panel-content space-y-4 p-2">
            <div>
              <span>Kind</span>
              <div class="flex items-center flex-wrap gap-4 px-2">
                <ul class="flex flex-col flex-wrap p-0 m-0 space-y-2 list-none">
                  <li
                    v-for="option in commandStore.activeCommandKinds"
                    :key="option"
                    class="inline-flex items-center gap-1 mr-4"
                  >
                    <input
                      type="checkbox"
                      :id="`kind-${option}`"
                      :value="option"
                      :checked="!commandStore.commandFilters.kind.includes(option)"
                      @change="handleCheckboxChange(option, $event, 'kind')"
                    />
                    <label :for="`kind-${option}`" class="text-sm cursor-pointer">
                      {{ option }}
                    </label>
                  </li>
                </ul>
              </div>
            </div>
            <div>
              <span>Status</span>
              <span class="flex items-center flex-wrap gap-4 px-2">
                <ul class="flex flex-col flex-wrap p-0 m-0 space-y-2 list-none">
                  <li
                    v-for="option in commandStore.activeCommandStatuses"
                    :key="option"
                    class="inline-flex items-center gap-1 mr-4"
                  >
                    <input
                      type="checkbox"
                      :id="`status-${option}`"
                      :value="option"
                      :checked="!commandStore.commandFilters.status.includes(option)"
                      @change="handleCheckboxChange(option, $event, 'status')"
                    />
                    <label :for="`status-${option}`" class="text-sm cursor-pointer">
                      {{ option }}
                    </label>
                  </li>
                </ul>
              </span>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <StickyScroller
      :trigger="commandStore.filteredCommands.length"
      :smooth="true"
      :showButton="true"
      class="flex-1 min-h-0"
    >
      <div class="flex flex-col p-2 gap-2">
        <template v-for="cmd in commandStore.filteredCommands" :key="cmd.command_id">
          <div
            class="rounded-lg"
            :class="
              cmd.command_id == commandStore.selectedCommandId
                ? 'ring-2 ring-[var(--accent-color)]'
                : ''
            "
          >
            <CommandBase
              v-if="Object.values(interestingCommandKinds).includes(cmd.command.kind)"
              :commandId="cmd.command_id"
              :commandStatus="cmd.status"
              :commandSymbol="getCommandSymbol(cmd.command)"
              :label="cmd.command.kind"
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
