import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { NetworkType } from '@/lib/ws/protocol'
import { fetchHyperliquidMid } from '@/lib/hyperliquidMid'

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
      const nextPrice = await fetchHyperliquidMid(
        targetNetwork === NetworkType.Testnet ? 'testnet' : 'mainnet',
        targetSymbol,
        controller.signal,
      )
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
