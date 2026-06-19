<script setup lang="ts">
import type { NativeProtectionState } from '@/stores/devices'
import { NativeProtectionStatus } from '@/lib/ws/protocol'
import { formatPrice, formatQty, getPositionSideClass, formatSide } from './utils'

const props = defineProps<{
  device: NativeProtectionState
  failureReason?: string | null
}>()

function getStatusClass(status: NativeProtectionStatus): string {
  switch (status) {
    case NativeProtectionStatus.Flat:
      return 'pill pill-ok'
    case NativeProtectionStatus.Tracking:
      return 'pill pill-info'
    case NativeProtectionStatus.Triggered:
      return 'pill pill-warn'
    case NativeProtectionStatus.Canceled:
      return 'pill pill-warn'
    case NativeProtectionStatus.Rejected:
      return 'pill pill-err'
    default:
      return 'pill'
  }
}

function fmtDate(d?: Date | null): string {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return '-'
  }
}
</script>

<template>
  <div class="space-y-4 p-3">
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-mono text-[var(--color-text)] m-0">Native Protection</h3>
        <span :class="getStatusClass(device.status)" class="text-[10px] px-2 py-1">
          {{ device.status }}
        </span>
      </div>
      <div class="text-[11px] text-[var(--color-text-dim)] font-mono">
        {{ device.symbol }} -
        <span :class="getPositionSideClass(device.position_side)">
          {{ formatSide(device.position_side) }}
        </span>
      </div>
    </div>

    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Attached TP/SL
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Take Profit
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ device.take_profit == null ? '-' : `$${formatPrice(device.take_profit)}` }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Stop Loss
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ device.stop_loss == null ? '-' : `$${formatPrice(device.stop_loss)}` }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Entry Updates
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ device.observed_entries }} / {{ device.expected_entries }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Protection Updates
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ device.observed_protection_orders }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Entry Filled
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ formatQty(device.entry_filled_qty) }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Protection Filled
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ formatQty(device.protection_filled_qty) }}
          </dd>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <h4
        class="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] m-0 border-b border-[var(--border-color)] pb-1"
      >
        Last Exchange Update
      </h4>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Client Order ID
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)] text-[10px] break-all">
            {{ device.last_client_order_id || '-' }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Parent Client ID
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)] text-[10px] break-all">
            {{ device.last_parent_client_order_id || '-' }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Remote Order ID
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)] text-[10px] break-all">
            {{ device.last_remote_order_id || '-' }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Order Status
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ device.last_order_status || '-' }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Created At
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ fmtDate(device.created_at) }}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] uppercase tracking-[0.04em] text-[var(--color-text-dim)] mb-1">
            Last Update
          </dt>
          <dd class="m-0 font-mono text-[var(--color-text)]">
            {{ fmtDate(device.last_update_seen_at) }}
          </dd>
        </div>
      </div>
    </div>

    <div
      v-if="failureReason"
      class="text-[11px] text-[var(--color-danger)] font-mono border border-[var(--color-danger)]/40 rounded p-2"
    >
      {{ failureReason }}
    </div>
  </div>
</template>
