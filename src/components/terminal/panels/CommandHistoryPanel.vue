<template>
  <StickyScroller :trigger="commands.length" :smooth="true" :showButton="true">
    <div class="command-history-panel">
      <template v-for="(cmd, index) in commands" :key="index">
        <template v-if="cmd.command.kind === 'TrailingEntryOrder'">
          <TELongCommand
            :command_id="cmd.command_id"
            :command_status="cmd.status"
            :command="cmd.command.data as TrailingEntryOrderCommand"
            @select="handleInspect"
          />
        </template>
        <CommandHistoryItem v-else :command="cmd" />
      </template>
    </div>
  </StickyScroller>
</template>

<script setup lang="ts">
import StickyScroller from '@/components/general/StickyScroller.vue'
import { useCommandStore } from '@/stores/command'
import { computed } from 'vue'

import CommandHistoryItem from '@/components/terminal/commands/CommandHistoryItem.vue'
import TELongCommand from '@/components/terminal/commands/TELongCommand.vue'
import type { TrailingEntryOrderCommand } from '@/lib/ws/protocol'

const interestingCommandKinds = ['TrailingEntryOrder']

const commandStore = useCommandStore()

const commands = computed(() =>
  commandStore.history.filter(
    (cmd) => cmd.command?.kind !== undefined && interestingCommandKinds.includes(cmd.command.kind),
  ),
)

function handleInspect(commandId: string) {
  commandStore.inspectCommand(commandId)
}
</script>

<style scoped>
.command-history-panel {
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.5rem;
}
</style>
