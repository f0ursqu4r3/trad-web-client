<template>
  <div class="flex flex-col h-full">
    <div class="panel">
      <div class="panel-header flex justify-end items-center gap-2">
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
                <ul class="flex flex-col flex-wrap p-0 m-0 list-none">
                  <li
                    v-for="option in store.activeCommandKinds"
                    :key="option"
                    class="inline-flex items-center gap-1 mr-4"
                  >
                    <input
                      type="checkbox"
                      :id="`kind-${option}`"
                      :value="option"
                      :checked="!store.commandFilters.kind.includes(option)"
                      @change="handleCheckboxChange(option, $event, 'kind')"
                    />
                    <label :for="`kind-${option}`" class="text-sm">{{ option }}</label>
                  </li>
                </ul>
              </div>
            </div>
            <div>
              <span>Status</span>
              <span class="flex items-center flex-wrap gap-4 px-2">
                <ul class="flex flex-col flex-wrap p-0 m-0 list-none">
                  <li
                    v-for="option in store.activeCommandStatuses"
                    :key="option"
                    class="inline-flex items-center gap-1 mr-4"
                  >
                    <input
                      type="checkbox"
                      :id="`status-${option}`"
                      :value="option"
                      :checked="!store.commandFilters.status.includes(option)"
                      @change="handleCheckboxChange(option, $event, 'status')"
                    />
                    <label :for="`status-${option}`" class="text-sm">{{ option }}</label>
                  </li>
                </ul>
              </span>
            </div>
          </div>
        </div>
      </Transition>
    </div>
    <StickyScroller
      :trigger="store.filteredCommands.length"
      :smooth="true"
      :showButton="true"
      class="overflow-y-auto flex-shrink-1"
    >
      <div class="flex flex-col p-2 gap-2">
        <template v-for="cmd in store.filteredCommands" :key="cmd.command_id">
          <div
            class="rounded-lg"
            :class="
              cmd.command_id == store.selectedCommandId ? 'ring-2 ring-[var(--accent-color)]' : ''
            "
          >
            <TELongCommand
              v-if="cmd.command.kind === 'TrailingEntryOrder'"
              :command_id="cmd.command_id"
              :command_status="cmd.status"
              :command="cmd.command.data"
              @select="handleInspect"
            />
            <CommandHistoryItem v-else :command="cmd" />
          </div>
        </template>
      </div>
    </StickyScroller>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import StickyScroller from '@/components/general/StickyScroller.vue'
import { useCommandStore } from '@/stores/command'
import { FunnelIcon } from '@/components/icons'

import CommandHistoryItem from '@/components/terminal/commands/CommandHistoryItem.vue'
import TELongCommand from '@/components/terminal/commands/TELongCommand.vue'

const store = useCommandStore()

const showFilters = ref(false)

const hiddenCommandCount = computed(() => {
  return store.commands.length - store.filteredCommands.length
})

function handleCheckboxChange(
  option: string,
  checkedOrEvent: boolean | Event,
  type: 'kind' | 'status',
) {
  const checked =
    typeof checkedOrEvent === 'boolean'
      ? checkedOrEvent
      : ((checkedOrEvent.target as HTMLInputElement | null)?.checked ?? false)

  if (checked) {
    const idx = store.commandFilters[type].indexOf(option as never)
    if (idx > -1) {
      store.commandFilters[type].splice(idx, 1)
    }
  } else {
    store.commandFilters[type].push(option as never)
  }
}

function handleInspect(commandId: string) {
  store.inspectCommand(commandId)
}
</script>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
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
