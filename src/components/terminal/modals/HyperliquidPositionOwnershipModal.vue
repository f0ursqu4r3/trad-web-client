<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import type { AccountRecord } from '@/stores/accounts'
import { useAccountsStore } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useWsStore } from '@/stores/ws'
import type {
  HyperliquidPositionOwnerData,
  HyperliquidSymbolOwnershipData,
} from '@/lib/ws/protocol'

const props = defineProps<{
  open: boolean
  account: AccountRecord | null
}>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const commands = useCommandStore()
const ws = useWsStore()
const flattenSymbol = ref<string | null>(null)
const flattenAcknowledged = ref(false)
const flattenAllOpen = ref(false)
const flattenAllAcknowledged = ref(false)
const actionMessage = ref<string | null>(null)

const marketContext = computed(() =>
  props.account ? accounts.getMarketContextForAccount(props.account.id) : null,
)
const ownership = computed(() => ws.hyperliquidOwnershipForMarketContext(marketContext.value))
const livePositions = computed(
  () =>
    ownership.value?.symbols.filter(
      (position) => Math.abs(position.live_signed_quantity) > 1e-12,
    ) ?? [],
)
const visiblePositions = computed(
  () => ownership.value?.symbols.filter(positionRequiresAttention) ?? [],
)
const error = computed(() =>
  props.account
    ? (ws.hyperliquidPositionOwnershipErrors[`hyperliquid:${props.account.id}`] ?? null)
    : null,
)

function refresh() {
  if (!marketContext.value) return
  ws.requestHyperliquidPositionOwnership(marketContext.value)
}

function inspect(commandId: string) {
  commands.inspectCommand(commandId)
  emit('close')
}

function prepareFlatten(symbol: string) {
  flattenAllOpen.value = false
  flattenAllAcknowledged.value = false
  flattenSymbol.value = symbol
  flattenAcknowledged.value = false
  actionMessage.value = null
}

function submitFlatten() {
  if (!marketContext.value || !flattenSymbol.value || !flattenAcknowledged.value) return
  ws.sendFlattenHyperliquidSymbol(marketContext.value, flattenSymbol.value)
  actionMessage.value = `Flatten requested for ${flattenSymbol.value}. Refresh after execution settles.`
  flattenSymbol.value = null
  flattenAcknowledged.value = false
}

function prepareFlattenAll() {
  flattenSymbol.value = null
  flattenAcknowledged.value = false
  flattenAllOpen.value = true
  flattenAllAcknowledged.value = false
  actionMessage.value = null
}

function submitFlattenAll() {
  if (!marketContext.value || !flattenAllAcknowledged.value) return
  ws.sendFlattenHyperliquidAccount(marketContext.value)
  actionMessage.value =
    'Flatten All requested. Every symbol is attempted independently; review the result notice.'
  flattenAllOpen.value = false
  flattenAllAcknowledged.value = false
}

function formatQuantity(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function formatTimestamp(value?: string | number | null): string {
  if (value == null) return '-'
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '-'
}

function ownerRequiresAttention(owner: HyperliquidPositionOwnerData): boolean {
  if (owner.entry_working || Math.abs(owner.remaining_quantity) > 1e-12) return true
  const protectionStatus = owner.protection_status?.toLowerCase() ?? null
  return protectionStatus !== null && !['flat', 'canceled'].includes(protectionStatus)
}

function positionRequiresAttention(position: HyperliquidSymbolOwnershipData): boolean {
  return (
    Math.abs(position.live_signed_quantity) > 1e-12 ||
    position.owners.some(ownerRequiresAttention) ||
    position.discrepancies.length > 0 ||
    position.opens_blocked
  )
}

function discrepancyLabel(value: string): string {
  const [kind, count] = value.split(':', 2)
  const labels: Record<string, string> = {
    external_same_side_surplus: 'External same-side surplus',
    unexplained_position_deficit: 'Unexplained position deficit',
    external_direction_flip_or_conflicting_ownership:
      'External direction flip or conflicting ownership',
    external_flatten: 'Position flattened outside Trad',
    stale_account_stream: 'Account stream is stale',
    unknown_external_open_orders: 'Unknown external open orders',
    ambiguous_or_unresolved_submission_intent: 'Ambiguous or unresolved submission',
  }
  const label = labels[kind] || kind.replace(/_/g, ' ')
  return count ? `${label}: ${count}` : label
}

watch(
  () => props.open,
  (open) => {
    flattenSymbol.value = null
    flattenAcknowledged.value = false
    flattenAllOpen.value = false
    flattenAllAcknowledged.value = false
    actionMessage.value = null
    if (open) refresh()
  },
)
</script>

<template>
  <BaseCommandModal
    :title="`Hyperliquid Positions${account ? ` - ${account.label}` : ''}`"
    :open="open"
    @close="emit('close')"
  >
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <p class="m-0 text-[11px] text-[var(--color-text-dim)]">
          Exchange position is authoritative. Trad ownership is reconstructed from persisted fills
          and exact protection identities.
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" @click="refresh">
            Refresh View
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm text-error"
            @click="prepareFlattenAll"
          >
            Flatten All
          </button>
        </div>
      </div>

      <p v-if="error" class="m-0 text-error">{{ error }}</p>
      <p v-else-if="!ownership" class="m-0 text-[var(--color-text-dim)]">Loading positions...</p>
      <p v-else-if="visiblePositions.length === 0" class="m-0 text-[var(--color-text-dim)]">
        No live or Trad-owned Hyperliquid positions.
      </p>

      <section
        v-if="ownership?.reconciliation"
        class="border border-[var(--border-color)] p-3 text-[11px]"
        data-testid="hyperliquid-reconciliation-evidence"
      >
        <header class="flex flex-wrap items-center justify-between gap-2">
          <strong>Exchange Reconciliation</strong>
          <span
            class="pill"
            :class="ownership.reconciliation.errors.length ? 'pill-warn' : 'pill-ok'"
          >
            {{ ownership.reconciliation.errors.length ? 'diagnostic errors' : 'observed' }}
          </span>
        </header>
        <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
          <span class="text-[var(--color-text-dim)]">Scope</span>
          <span class="text-right font-mono">{{ ownership.reconciliation.scope }}</span>
          <span class="text-[var(--color-text-dim)]">Observed</span>
          <span class="text-right font-mono">{{ formatTimestamp(ownership.observed_at) }}</span>
          <span class="text-[var(--color-text-dim)]">Account stream</span>
          <span
            class="text-right font-mono"
            :class="
              !ownership.reconciliation.stream_health.expected ||
              ownership.reconciliation.stream_health.fresh
                ? 'text-success'
                : 'text-error'
            "
          >
            {{
              !ownership.reconciliation.stream_health.expected
                ? 'idle (no active devices)'
                : ownership.reconciliation.stream_health.connected
                  ? ownership.reconciliation.stream_health.fresh
                    ? 'connected / fresh'
                    : 'connected / stale'
                  : 'disconnected'
            }}
          </span>
          <span class="text-[var(--color-text-dim)]">Last stream frame</span>
          <span class="text-right font-mono">
            {{
              !ownership.reconciliation.stream_health.expected
                ? 'not required while idle'
                : ownership.reconciliation.stream_health.last_frame_age_ms == null
                  ? '-'
                  : `${ownership.reconciliation.stream_health.last_frame_age_ms} ms ago`
            }}
          </span>
          <span class="text-[var(--color-text-dim)]">Open orders checked</span>
          <span class="text-right font-mono">
            {{ ownership.reconciliation.authoritative_open_orders_checked }}
            ({{ ownership.reconciliation.known_trad_open_orders }} Trad /
            {{ ownership.reconciliation.unknown_external_open_orders }} external)
          </span>
          <span class="text-[var(--color-text-dim)]">Actors refreshed</span>
          <span class="text-right font-mono">
            {{ ownership.reconciliation.refreshed_device_count }}
          </span>
          <span class="text-[var(--color-text-dim)]">Fill history read</span>
          <span class="text-right font-mono">
            {{
              ownership.reconciliation.expensive_fills_read
                ? `yes (${ownership.reconciliation.recent_fill_count} records)`
                : 'not required'
            }}
          </span>
          <span class="text-[var(--color-text-dim)]">Durable audit</span>
          <span class="text-right font-mono">
            {{ ownership.reconciliation.audit_recorded ? 'recorded' : 'disabled' }}
          </span>
        </div>
        <div
          v-if="ownership.reconciliation.errors.length"
          class="mt-3 border-t border-[var(--border-color)] pt-2 text-error"
        >
          <div v-for="item in ownership.reconciliation.errors" :key="item">{{ item }}</div>
        </div>
      </section>
      <section
        v-if="flattenAllOpen"
        class="border border-[var(--color-error)] p-3 text-[11px]"
        aria-label="Confirm flatten all positions"
      >
        <strong>Flatten every Hyperliquid position</strong>
        <p class="my-2">
          This cancels affected Trad entry work and submits an independent reduce-only market close
          for every authoritative nonzero position on {{ account?.label }}. Trad-owned protection is
          cleared only after each close succeeds. External or manually created quantity is also
          closed.
        </p>
        <div class="mb-2 font-mono">
          <div v-for="position in livePositions" :key="position.symbol">
            {{ position.symbol }}: {{ formatQuantity(position.live_signed_quantity) }}
          </div>
          <div v-if="!livePositions.length" class="text-[var(--color-text-dim)]">
            The latest view shows no nonzero positions. The backend will check the exchange again
            before acting.
          </div>
        </div>
        <label class="flex items-start gap-2">
          <input v-model="flattenAllAcknowledged" type="checkbox" />
          <span>
            I understand this attempts to close every position in this Hyperliquid account.
          </span>
        </label>
        <div class="mt-3 flex justify-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" @click="flattenAllOpen = false">
            Back
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!flattenAllAcknowledged"
            @click="submitFlattenAll"
          >
            Confirm Flatten All
          </button>
        </div>
      </section>

      <article
        v-for="position in visiblePositions"
        :key="position.symbol"
        class="border border-[var(--border-color)] p-3"
      >
        <header class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <strong>{{ position.symbol }}</strong>
            <span class="pill" :class="position.status === 'consistent' ? 'pill-ok' : 'pill-warn'">
              {{ position.status.replace(/_/g, ' ') }}
            </span>
            <span v-if="position.opens_blocked" class="pill pill-err">opens blocked</span>
          </div>
          <div class="flex flex-wrap justify-end gap-2">
            <button
              v-if="Math.abs(position.live_signed_quantity) > 1e-12"
              type="button"
              class="btn btn-secondary btn-sm text-error"
              @click="prepareFlatten(position.symbol)"
            >
              Flatten Symbol
            </button>
          </div>
        </header>

        <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span class="text-[var(--color-text-dim)]">Live signed quantity</span>
          <span class="text-right font-mono">{{
            formatQuantity(position.live_signed_quantity)
          }}</span>
          <span class="text-[var(--color-text-dim)]">Trad owned, live side</span>
          <span class="text-right font-mono">{{
            formatQuantity(position.owned_same_side_quantity)
          }}</span>
          <span class="text-[var(--color-text-dim)]">External / unattributed</span>
          <span class="text-right font-mono">{{
            formatQuantity(position.external_same_side_quantity)
          }}</span>
          <span class="text-[var(--color-text-dim)]">Unresolved ownership deficit</span>
          <span class="text-right font-mono">{{
            formatQuantity(position.unresolved_deficit_quantity)
          }}</span>
        </div>

        <div
          v-if="position.discrepancies.length"
          class="mt-3 border border-[var(--color-warning)] p-2 text-[11px]"
        >
          <strong>Discrepancies</strong>
          <div v-for="item in position.discrepancies" :key="item" class="mt-1 text-warning">
            {{ discrepancyLabel(item) }}
          </div>
        </div>

        <div
          v-if="position.owners.some(ownerRequiresAttention)"
          class="mt-3 border-t border-[var(--border-color)] pt-2"
        >
          <div
            v-for="owner in position.owners.filter(ownerRequiresAttention)"
            :key="owner.command_id"
            class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-[var(--border-color)] py-2 last:border-b-0"
          >
            <div class="min-w-0">
              <button
                type="button"
                class="block truncate text-left text-[var(--accent-color)]"
                :title="owner.command_id"
                @click="inspect(owner.command_id)"
              >
                {{ owner.command_kind }} #{{ owner.command_id.slice(0, 8) }}
              </button>
              <span class="text-[10px] text-[var(--color-text-dim)]">
                {{ owner.position_side }} ·
                {{ owner.entry_working ? 'entry working' : 'entry terminal' }} · protection
                {{ owner.protection_status ?? 'none' }}
              </span>
            </div>
            <span class="text-right font-mono text-[11px]">
              {{ formatQuantity(owner.remaining_quantity) }}
            </span>
          </div>
        </div>
      </article>

      <section
        v-if="flattenSymbol"
        class="border border-[var(--color-warning)] p-3 text-[11px]"
        aria-label="Confirm flatten symbol"
      >
        <strong>Flatten {{ flattenSymbol }}</strong>
        <p class="my-2">
          This cancels Trad entry work, submits a reduce-only market close for the entire
          authoritative Hyperliquid position, and clears all Trad-owned protection on this symbol.
          It also closes external or manually created quantity.
        </p>
        <label class="flex items-start gap-2">
          <input v-model="flattenAcknowledged" type="checkbox" />
          <span>I understand this closes the entire account position for {{ flattenSymbol }}.</span>
        </label>
        <div class="mt-3 flex justify-end gap-2">
          <button type="button" class="btn btn-secondary btn-sm" @click="flattenSymbol = null">
            Back
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!flattenAcknowledged"
            @click="submitFlatten"
          >
            Confirm Flatten
          </button>
        </div>
      </section>
      <p v-if="actionMessage" class="m-0 text-[var(--color-success)]">{{ actionMessage }}</p>
    </div>
  </BaseCommandModal>
</template>
