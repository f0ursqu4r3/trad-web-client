<script setup lang="ts">
import { computed } from 'vue'
import type { TrailingEntryState } from '@/stores/devices'
import { useAccountsStore } from '@/stores/accounts'
import {
  formatPrice,
  formatPercent,
  getPhaseClass,
  getLifecycleClass,
  getPositionSideClass,
  formatSide,
} from './utils'

const props = defineProps<{
  device: TrailingEntryState
}>()
const accounts = useAccountsStore()

const networkLabel = computed(() => {
  const ctx = props.device.market_context
  if (ctx.type === 'binance' || ctx.type === 'bifake') {
    const account = accounts.accounts.find((item) => item.id === ctx.account_id)
    return account?.network ?? '-'
  }
  return '-'
})
</script>

<template>
  <div class="space-y-4 p-3">
    <!-- Header Section -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono text-[var(--color-text)] m-0">Trailing Entry Device</h3>
        <div class="flex items-center gap-2">
          <span :class="getPhaseClass(device.phase)" class="text-[10px] px-2 py-1">
            {{ device.phase }}
          </span>
          <span :class="getLifecycleClass(device.lifecycle)" class="text-[10px] px-2 py-1">
            {{ device.lifecycle }}
          </span>
        </div>
      </div>
      <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
        {{ device.symbol }} •
        <span :class="getPositionSideClass(device.position_side)">
          {{ formatSide(device.position_side) }}
        </span>
      </div>
    </div>

    <!-- Parameters Section -->
    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Parameters
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Activation Price
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            ${{ formatPrice(device.activation_price) }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Jump Threshold
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ formatPercent(device.jump_frac_threshold) }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Stop Loss
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            ${{ formatPrice(device.stop_loss) }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Risk Amount
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            ${{ formatPrice(device.risk_amount) }}
          </dd>
        </div>
      </div>
    </div>

    <!-- Current State Section -->
    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Current State
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Peak Price
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">${{ formatPrice(device.peak) }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Peak Index
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.peak_index }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Base Index
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.base_index }}</dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Total Points
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.total_points }}</dd>
        </div>
      </div>
    </div>

    <!-- Results Section (only show if device has completed data) -->
    <div v-if="device.completed || device.cancelled || device.succeeded" class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Results
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div v-if="device.position_size > 0">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Position Size
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ device.position_size.toFixed(6) }}
          </dd>
        </div>
        <div v-if="device.actual_activation_price > 0">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Actual Activation
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            ${{ formatPrice(device.actual_activation_price) }}
          </dd>
        </div>
        <div v-if="device.buy_or_sell_price > 0">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Entry Price
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            ${{ formatPrice(device.buy_or_sell_price) }}
          </dd>
        </div>
      </div>

      <!-- Status indicators -->
      <div class="flex gap-2 flex-wrap">
        <span v-if="device.completed" class="pill pill-ok text-[10px] px-2 py-1">Completed</span>
        <span v-if="device.cancelled" class="pill pill-warn text-[10px] px-2 py-1">Cancelled</span>
        <span v-if="device.succeeded" class="pill pill-ok text-[10px] px-2 py-1">Succeeded</span>
        <span v-if="device.stop_loss_hit" class="pill pill-err text-[10px] px-2 py-1">
          Stop Loss Hit
        </span>
      </div>
    </div>

    <!-- Trigger Points (only show if available) -->
    <div
      v-if="device.start_trigger_index !== null || device.end_trigger_index !== null"
      class="space-y-3"
    >
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Trigger Points
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div v-if="device.start_trigger_index !== null">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Start Trigger
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.start_trigger_index }}</dd>
        </div>
        <div v-if="device.end_trigger_index !== null">
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            End Trigger
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.end_trigger_index }}</dd>
        </div>
      </div>
    </div>

    <!-- Market Context Info -->
    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Market Context
      </h4>
      <div class="text-[12px]">
        <div class="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
              Type
            </dt>
            <dd class="m-0 font-mono text-[var(--color-text)]">{{ device.market_context.type }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
              Network
            </dt>
            <dd class="m-0 font-mono text-[var(--color-text)]">{{ networkLabel }}</dd>
          </div>
        </div>
        <div
          v-if="
            (device.market_context.type === 'binance' ||
              device.market_context.type === 'bifake') &&
            'account_id' in device.market_context
          "
        >
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Account ID
          </dt>
          <dd class="m-0 font-mono text-[10px] text-[var(--color-text-dim)]">
            {{ device.market_context.account_id.slice(0, 8) }}...
          </dd>
        </div>
        <div
          v-if="device.market_context.type === 'sim' && 'sim_market_id' in device.market_context"
          class="mt-1"
        >
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Sim Market ID
          </dt>
          <dd class="m-0 font-mono text-[10px] text-[var(--color-text-dim)]">
            {{ device.market_context.sim_market_id.slice(0, 8) }}...
          </dd>
        </div>
      </div>
    </div>
  </div>
</template>
