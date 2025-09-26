import type { CommandHistoryItem } from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'

export const useCommandStore = defineStore('command', () => {
  const ws = useWsStore()

  const history = ref<CommandHistoryItem[]>(
    ws.commandHistory.length ? ws.commandHistory : ([] as CommandHistoryItem[]),
  )

  const selectedCommandId = ref<string | null>(null)
  const selectedCommand = computed<CommandHistoryItem | null>(() => {
    if (!selectedCommandId.value) return null
    return history.value.find((cmd) => cmd.command_id === selectedCommandId.value) ?? null
  })

  function selectCommand(commandId: string | null) {
    selectedCommandId.value = commandId
    if (!commandId) return
    ws.listCommandDevices(commandId)
  }

  return { history, selectedCommandId, selectedCommand, selectCommand }
})
