<script lang="ts" setup>
import type { SetLeverageCommand } from '@/lib/ws/protocol'
import { formatMarketContext } from '@/lib/marketContext'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps<{ command: SetLeverageCommand }>()

const accountsStore = useAccountsStore()
</script>

<template>
  <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 m-0">
    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Symbol
      </dt>
      <dd class="m-0 text-[12px] font-mono">{{ props.command.symbol }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Leverage
      </dt>
      <dd class="m-0 text-[12px]">{{ props.command.leverage }}x</dd>
    </div>

    <div class="sm:col-span-2">
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Context
      </dt>
      <dd class="m-0 text-[12px]">
        {{ formatMarketContext(props.command.market_context, accountsStore.accounts) }}
      </dd>
    </div>
  </dl>
</template>
