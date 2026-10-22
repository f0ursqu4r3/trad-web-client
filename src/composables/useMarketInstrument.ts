import { ref, watch, type Ref } from 'vue'

import { loadMarketInstrument, type MarketInstrument } from '@/lib/marketCatalog'
import type { AccountRecord } from '@/stores/accounts'

// The catalog row of the selected market (spelling, dex, margin mode, fee
// multipliers), or null while it loads or when the catalog does not list it.
export function useMarketInstrument(
  account: () => AccountRecord | null,
  symbol: () => string,
): Ref<MarketInstrument | null> {
  const instrument = ref<MarketInstrument | null>(null)
  let generation = 0
  watch(
    () => {
      const current = account()
      const selected = symbol().trim().toUpperCase()
      return current === null || selected === ''
        ? null
        : `${current.exchange}|${current.network}|${selected}`
    },
    async (key) => {
      const current = ++generation
      instrument.value = null
      const selected = account()
      if (key === null || selected === null) return
      try {
        const loaded = await loadMarketInstrument(selected, symbol())
        if (current === generation) instrument.value = loaded
      } catch {
        // The catalog is advisory here; the node decides on submit.
      }
    },
    { immediate: true },
  )
  return instrument
}
