import type { CommandHistoryItem } from '@/lib/ws/protocol'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWsStore } from '@/stores/ws'

export const useCommandStore = defineStore('command', () => {
  const ws = useWsStore()

  const history = ref<CommandHistoryItem[]>(
    ws.commandHistory.length ? ws.commandHistory : ([] as CommandHistoryItem[]),
  )
  const mapping = ref<Record<string, CommandHistoryItem>>({})

  return { history, mapping }
})
