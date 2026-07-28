<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import type { AccountRecord } from '@/stores/accounts'
import { useAccountsStore } from '@/stores/accounts'
import { useCommandStore } from '@/stores/command'
import { useWsStore } from '@/stores/ws'

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
const actionMessage = ref<string | null>(null)

const marketContext = computed(() =>
  props.account ? accounts.getMarketContextForAccount(props.account.id) : null,
)
const ownership = computed(() => ws.hyperliquidOwnershipForMarketContext(marketContext.value))
const error = computed(() =>
  props.account ? (ws.hyperliquidPositionOwnershipErrors[`hyperliquid:${props.account.id}`] ?? null) : null,
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

function formatQuantity(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

watch(
  () => props.open,
  (open) => {
    flattenSymbol.value = null
    flattenAcknowledged.value = false
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
        <button type="button" class="btn btn-secondary btn-sm" @click="refresh">Refresh</button>
      </div>

      <p v-if="error" class="m-0 text-error">{{ error }}</p>
      <p v-else-if="!ownership" class="m-0 text-[var(--color-text-dim)]">Loading positions...</p>
      <p v-else-if="ownership.symbols.length === 0" class="m-0 text-[var(--color-text-dim)]">
        No live or Trad-owned Hyperliquid positions.
      </p>

      <article
        v-for="position in ownership?.symbols ?? []"
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
          <button
            v-if="Math.abs(position.live_signed_quantity) > 1e-12"
            type="button"
            class="btn btn-secondary btn-sm text-error"
            @click="prepareFlatten(position.symbol)"
          >
            Flatten Symbol
          </button>
        </header>

        <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span class="text-[var(--color-text-dim)]">Live signed quantity</span>
          <span class="text-right font-mono">{{ formatQuantity(position.live_signed_quantity) }}</span>
          <span class="text-[var(--color-text-dim)]">Trad owned, live side</span>
          <span class="text-right font-mono">{{ formatQuantity(position.owned_same_side_quantity) }}</span>
          <span class="text-[var(--color-text-dim)]">External / unattributed</span>
          <span class="text-right font-mono">{{ formatQuantity(position.external_same_side_quantity) }}</span>
          <span class="text-[var(--color-text-dim)]">Unresolved ownership deficit</span>
          <span class="text-right font-mono">{{ formatQuantity(position.unresolved_deficit_quantity) }}</span>
        </div>

        <div v-if="position.owners.length" class="mt-3 border-t border-[var(--border-color)] pt-2">
          <div
            v-for="owner in position.owners"
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
