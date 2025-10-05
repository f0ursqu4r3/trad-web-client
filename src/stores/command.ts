import type { CommandDevicesListData, CommandHistoryItem, Uuid } from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWsStore } from '@/stores/ws'

export const useCommandStore = defineStore('command', () => {
  const ws = useWsStore()

  const history = ref<CommandHistoryItem[]>([])
  const devices = ref<Record<Uuid, CommandDevicesListData>>(
    {} as Record<Uuid, CommandDevicesListData>,
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

  return { history, devices, selectedCommandId, selectedCommand, selectCommand }
})
