import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { NetworkType } from '@/lib/ws/protocol'

const REFRESH_MS = 5_000

export function useHyperliquidMidPrice(
  network: Ref<NetworkType | null>,
  symbol: Ref<string>,
  enabled: Ref<boolean>,
) {
  const price = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const fetchedAt = ref<number | null>(null)
  let timer: number | null = null
  let controller: AbortController | null = null
  let requestSequence = 0

  function stop(reset = false) {
    requestSequence += 1
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
    controller?.abort()
    controller = null
    loading.value = false
    if (reset) {
      price.value = null
      error.value = null
      fetchedAt.value = null
    }
  }

  async function refresh() {
    const targetSymbol = symbol.value.trim().toUpperCase()
    const targetNetwork = network.value
    if (!enabled.value || !targetNetwork || !targetSymbol) {
      stop(true)
      return
    }

    const sequence = ++requestSequence
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    try {
      const endpoint =
        targetNetwork === NetworkType.Testnet
          ? 'https://api.hyperliquid-testnet.xyz/info'
          : 'https://api.hyperliquid.xyz/info'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = (await response.json()) as Record<string, string | number | undefined>
      const nextPrice = Number(body[targetSymbol])
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        throw new Error(`No midpoint available for ${targetSymbol}`)
      }
      if (sequence !== requestSequence) return
      price.value = nextPrice
      fetchedAt.value = Date.now()
      error.value = null
    } catch (cause) {
      if (sequence !== requestSequence || controller?.signal.aborted) return
      price.value = null
      fetchedAt.value = null
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (sequence === requestSequence) {
        loading.value = false
        controller = null
        timer = window.setTimeout(refresh, REFRESH_MS)
      }
    }
  }

  watch(
    [network, symbol, enabled],
    () => {
      stop(true)
      if (enabled.value) void refresh()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => stop())

  return { price, loading, error, fetchedAt, refresh }
}
