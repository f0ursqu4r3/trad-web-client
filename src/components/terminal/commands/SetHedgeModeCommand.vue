<script lang="ts" setup>
import type { SetHedgeModeCommand } from '@/lib/ws/protocol'
import { formatMarketContext } from '@/lib/marketContext'
import { useAccountsStore } from '@/stores/accounts'

const props = defineProps<{ command: SetHedgeModeCommand }>()

const accountsStore = useAccountsStore()
</script>

<template>
  <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 m-0">
    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Hedge Mode
      </dt>
      <dd class="m-0 text-[12px]">{{ props.command.enabled ? 'Enable' : 'Disable' }}</dd>
    </div>

    <div>
      <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
        Scope
      </dt>
      <dd class="m-0 text-[12px]">Account</dd>
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
