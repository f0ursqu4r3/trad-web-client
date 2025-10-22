<template>
  <StickyScroller :trigger="store.commands.length" :smooth="true" :showButton="true">
    <div class="flex flex-col p-2 gap-2">
      <template v-for="(cmd, index) in store.commands" :key="index">
        <div
          class="rounded-lg"
          :class="
            cmd.command_id == store.selectedCommandId ? 'ring-2 ring-[var(--accent-color)]' : ''
          "
        >
          <template v-if="cmd.command.kind === 'TrailingEntryOrder'">
            <TELongCommand
              :command_id="cmd.command_id"
              :command_status="cmd.status"
              :command="cmd.command.data"
              @select="handleInspect"
            />
          </template>
          <CommandHistoryItem v-else :command="cmd" />
        </div>
      </template>
    </div>
  </StickyScroller>
</template>

<script setup lang="ts">
import StickyScroller from '@/components/general/StickyScroller.vue'
import { useCommandStore } from '@/stores/command'

import CommandHistoryItem from '@/components/terminal/commands/CommandHistoryItem.vue'
import TELongCommand from '@/components/terminal/commands/TELongCommand.vue'

const store = useCommandStore()

function handleInspect(commandId: string) {
  store.inspectCommand(commandId)
}
</script>
