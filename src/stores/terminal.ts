import { defineStore } from 'pinia'
import { ref, computed, onUnmounted } from 'vue'

export interface LogLine {
  id: number
  text: string
  ts: number
}
export interface EntryDevice {
  id: string
  direction: 'LONG' | 'SHORT'
  activationPrice: number
  status: 'Triggered' | 'Armed'
  entryPrice?: number
}
export interface PricePoint {
  time: number
  value: number
}

let logCounter = 0

export const useTerminalStore = defineStore('terminal', () => {
  const logs = ref<LogLine[]>([])
  const devices = ref<EntryDevice[]>([
    {
      id: 'f3152000',
      direction: 'LONG',
      activationPrice: 600.25,
      status: 'Triggered',
      entryPrice: 599.7,
    },
    { id: '540a0396', direction: 'LONG', activationPrice: 600.7, status: 'Armed' },
  ])
  const selectedDeviceId = ref<string | null>(devices.value[0]?.id || null)

  const priceSeries = ref<PricePoint[]>([])
  const lastPrice = ref(600.0)

  function pushLog(text: string) {
    logs.value.push({ id: ++logCounter, text, ts: Date.now() })
    if (logs.value.length > 500) logs.value.shift()
  }

  function selectDevice(id: string | null) {
    selectedDeviceId.value = id
  }

  const selectedDevice = computed(
    () => devices.value.find((d) => d.id === selectedDeviceId.value) || null,
  )

  // Simulated price and logs interval
  const priceInterval = setInterval(() => {
    const drift = (Math.random() - 0.5) * 0.3
    lastPrice.value = Math.max(10, lastPrice.value + drift)
    priceSeries.value.push({ time: Date.now(), value: parseFloat(lastPrice.value.toFixed(2)) })
    if (priceSeries.value.length > 1000) priceSeries.value.shift()
    if (Math.random() < 0.3) pushLog(`Tick @ ${lastPrice.value.toFixed(2)}`)
  }, 1200)

  onUnmounted(() => clearInterval(priceInterval))

  function parseCommand(cmd: string) {
    const parts = cmd.trim().split(/\s+/)
    if (!parts.length) return
    if (parts[0] === 'select' && parts[1]) {
      selectDevice(parts[1])
      pushLog(`Selected device ${parts[1]}`)
    } else if (parts[0] === 'log') {
      pushLog(parts.slice(1).join(' ') || '(empty)')
    } else {
      pushLog(`Unknown command: ${cmd}`)
    }
  }

  return {
    logs,
    devices,
    selectedDeviceId,
    selectedDevice,
    priceSeries,
    lastPrice,
    pushLog,
    selectDevice,
    parseCommand,
  }
})
