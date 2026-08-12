<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'

import FlattenCommandModal from '@/components/engine/commands/FlattenCommandModal.vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { isExactZero } from '@/lib/exactDecimalMath'
import type { PositionProjection } from '@/lib/gateway'
import { commandOwnershipScopeIds } from '@/lib/projection/ownership'
import { useAccountProjectionStore } from '@/stores/accountProjection'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import { useProjectionUiStore } from '@/stores/projectionUi'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const projections = useAccountProjectionStore()
const projectionUi = useProjectionUiStore()
const showAll = ref(false)
const refreshError = ref<string | null>(null)
const flattenTarget = ref<{ kind: 'account' } | { kind: 'symbol'; symbol: string } | null>(null)

const account = computed(() => accounts.selectedAccount)
const live = computed(() => projections.selectedLive)
const summary = computed(() => live.value?.checkpoint.summary ?? null)
const visiblePositions = computed(() =>
  [...(live.value?.positions ?? [])]
    .filter((position) => showAll.value || positionRequiresAttention(position))
    .sort((left, right) => left.symbol.localeCompare(right.symbol)),
)
const livePositionCount = computed(
  () => (live.value?.positions ?? []).filter(hasExchangePosition).length,
)
const scopeCommands = computed(() => {
  const result = new Map<string, string>()
  for (const command of live.value?.commands ?? []) {
    for (const scopeId of commandOwnershipScopeIds(command)) {
      result.set(scopeId, command.command_id)
    }
  }
  return result
})
const refreshBusy = computed(() => summary.value?.reconciliation_status === 'reconciling')

watch(
  () => accounts.selectedAccountId,
  () => {
    flattenTarget.value = null
    refreshError.value = null
  },
)

function positionRequiresAttention(position: PositionProjection): boolean {
  return (
    position.status !== 'consistent' ||
    position.reconciliation_required ||
    hasExchangePosition(position) ||
    hasQuantity(position.owned_quantity) ||
    hasQuantity(position.external_quantity) ||
    hasQuantity(position.deficit_quantity) ||
    Object.values(position.owned_exposure).some(
      (exposure) => !isExactZero(exposure.remaining_quantity),
    ) ||
    Object.values(position.unallocated_fills).some((quantity) => !isExactZero(quantity))
  )
}

function hasExchangePosition(position: PositionProjection): boolean {
  return hasQuantity(position.exchange_quantity)
}

function hasQuantity(quantity: { long: string; short: string }): boolean {
  return !isExactZero(quantity.long) || !isExactZero(quantity.short)
}

function scopeCommand(scopeId: string): string | null {
  return scopeCommands.value.get(scopeId) ?? null
}

function inspectScope(scopeId: string): void {
  const commandId = scopeCommand(scopeId)
  if (commandId === null) return
  projectionUi.selectCommand(commandId)
  emit('close')
}

async function refreshExchange(): Promise<void> {
  refreshError.value = null
  try {
    await gateway.refreshReconciliation()
  } catch (error) {
    refreshError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <BaseCommandModal
    :title="`Account Positions${account ? ` - ${account.label}` : ''}`"
    :open="open"
    size="wide"
    @close="emit('close')"
  >
    <div class="position-inspector" data-testid="account-position-inspector">
      <header class="inspector-toolbar">
        <p>
          Exchange inventory is authoritative. Trad ownership comes from revisioned fills and
          explicit scope identities.
        </p>
        <div class="toolbar-actions">
          <label><input v-model="showAll" type="checkbox" /> Show flat symbols</label>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="gateway.status !== 'ready' || refreshBusy"
            @click="refreshExchange"
          >
            <RefreshCw :size="12" :class="{ spinning: refreshBusy }" />
            Refresh exchange state
          </button>
          <button
            class="btn btn-sm btn-danger"
            type="button"
            :disabled="livePositionCount === 0"
            @click="flattenTarget = { kind: 'account' }"
          >
            Flatten all
          </button>
        </div>
      </header>

      <section v-if="summary" class="account-summary">
        <div>
          <span>Projection revision</span>
          <strong>{{ live?.checkpoint.projection_revision }}</strong>
        </div>
        <div>
          <span>Private stream</span>
          <strong>{{ summary.private_stream_status }}</strong>
        </div>
        <div>
          <span>Reconciliation</span>
          <strong>{{ summary.reconciliation_status }}</strong>
        </div>
        <div>
          <span>Inventory ready</span>
          <strong>{{ summary.position_inventory_ready ? 'yes' : 'no' }}</strong>
        </div>
        <div>
          <span>Account risk blocked</span>
          <strong :class="{ danger: summary.reconciliation_required }">
            {{ summary.reconciliation_required ? 'yes' : 'no' }}
          </strong>
        </div>
      </section>

      <p v-if="refreshError" class="danger">{{ refreshError }}</p>

      <section v-if="live?.balances.length" class="balance-band">
        <h3>Balances</h3>
        <div class="balance-list">
          <div v-for="balance in live.balances" :key="balance.asset">
            <strong>{{ balance.asset }}</strong>
            <span>Wallet {{ balance.wallet ?? '-' }}</span>
            <span>Equity {{ balance.equity ?? '-' }}</span>
            <span>Available {{ balance.available ?? '-' }}</span>
          </div>
        </div>
      </section>

      <p v-if="visiblePositions.length === 0" class="empty-state">
        No live, owned, external, or unresolved positions.
      </p>

      <article
        v-for="position in visiblePositions"
        :key="position.symbol"
        class="position-band"
        :data-symbol="position.symbol"
      >
        <header>
          <div>
            <strong>{{ position.symbol }}</strong>
            <span class="status" :data-status="position.status">{{ position.status }}</span>
            <span v-if="position.reconciliation_required" class="danger"
              >reconciliation required</span
            >
          </div>
          <button
            v-if="hasExchangePosition(position)"
            class="btn btn-sm btn-danger"
            type="button"
            @click="flattenTarget = { kind: 'symbol', symbol: position.symbol }"
          >
            Flatten symbol
          </button>
        </header>

        <div class="quantity-table">
          <span></span><span>Long</span><span>Short</span> <strong>Exchange</strong
          ><span>{{ position.exchange_quantity.long }}</span
          ><span>{{ position.exchange_quantity.short }}</span> <strong>Trad owned</strong
          ><span>{{ position.owned_quantity.long }}</span
          ><span>{{ position.owned_quantity.short }}</span> <strong>External</strong
          ><span>{{ position.external_quantity.long }}</span
          ><span>{{ position.external_quantity.short }}</span> <strong>Deficit</strong
          ><span :class="{ danger: !isExactZero(position.deficit_quantity.long) }">{{
            position.deficit_quantity.long
          }}</span
          ><span :class="{ danger: !isExactZero(position.deficit_quantity.short) }">{{
            position.deficit_quantity.short
          }}</span>
        </div>

        <div v-if="Object.keys(position.owned_exposure).length" class="ownership-list">
          <h4>Trad-owned exposure</h4>
          <div v-for="exposure in position.owned_exposure" :key="exposure.scope_id">
            <button
              class="scope-link"
              type="button"
              :disabled="scopeCommand(exposure.scope_id) === null"
              :title="exposure.scope_id"
              @click="inspectScope(exposure.scope_id)"
            >
              {{ exposure.scope_id.slice(0, 12) }}
            </button>
            <span>{{ exposure.side }}</span>
            <span>{{ exposure.opened_quantity }} opened</span>
            <span>{{ exposure.reduced_quantity }} reduced</span>
            <strong>{{ exposure.remaining_quantity }} remaining</strong>
          </div>
        </div>

        <div v-if="Object.keys(position.unallocated_fills).length" class="unallocated-list">
          <h4>Unallocated fills</h4>
          <div v-for="(quantity, eventId) in position.unallocated_fills" :key="eventId">
            <span :title="eventId">{{ eventId }}</span>
            <strong>{{ quantity }}</strong>
          </div>
        </div>
      </article>
    </div>
  </BaseCommandModal>

  <FlattenCommandModal
    :open="flattenTarget !== null"
    :initial-account-id="accounts.selectedAccountId ?? ''"
    :initial-target="flattenTarget?.kind ?? 'symbol'"
    :initial-symbol="flattenTarget?.kind === 'symbol' ? flattenTarget.symbol : ''"
    @close="flattenTarget = null"
  />
</template>

<style scoped>
.position-inspector {
  display: grid;
  gap: 12px;
}

.inspector-toolbar,
.position-band > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.inspector-toolbar p {
  max-width: 450px;
  margin: 0;
  color: var(--color-text-dim);
  font-size: 11px;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.toolbar-actions label,
.toolbar-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.account-summary,
.balance-list,
.quantity-table {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border: 1px solid var(--border-color);
}

.account-summary > div,
.balance-list > div {
  display: grid;
  gap: 3px;
  padding: 7px;
  border-right: 1px solid var(--border-color);
}

.account-summary span,
.balance-list span {
  color: var(--color-text-dim);
  font-size: 10px;
}

.balance-band h3,
.ownership-list h4,
.unallocated-list h4 {
  margin: 0 0 6px;
  color: var(--color-accent);
  font-size: 10px;
  font-weight: normal;
  text-transform: uppercase;
}

.balance-list {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.position-band {
  border-top: 1px solid var(--border-color);
}

.position-band > header {
  padding: 8px 0;
}

.position-band > header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status {
  color: var(--color-text-dim);
  font-size: 10px;
  text-transform: uppercase;
}

.status[data-status='consistent'] {
  color: var(--color-success);
}

.quantity-table {
  grid-template-columns: minmax(110px, 1fr) repeat(2, minmax(100px, 1fr));
}

.quantity-table > * {
  padding: 5px 7px;
  text-align: right;
  border-top: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.quantity-table > :nth-child(3n + 1) {
  text-align: left;
}

.ownership-list,
.unallocated-list {
  padding-top: 8px;
}

.ownership-list > div,
.unallocated-list > div {
  display: grid;
  grid-template-columns: minmax(110px, 1.4fr) repeat(4, minmax(80px, 1fr));
  gap: 8px;
  padding: 5px 0;
  color: var(--color-text-dim);
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
  font-size: 10px;
}

.unallocated-list > div {
  grid-template-columns: minmax(0, 1fr) auto;
}

.scope-link {
  overflow: hidden;
  padding: 0;
  color: var(--color-accent);
  text-align: left;
  text-overflow: ellipsis;
  background: transparent;
  border: 0;
  white-space: nowrap;
}

.danger {
  color: var(--color-error) !important;
}

.spinning {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .inspector-toolbar {
    flex-direction: column;
  }

  .toolbar-actions {
    justify-content: flex-start;
  }

  .account-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
