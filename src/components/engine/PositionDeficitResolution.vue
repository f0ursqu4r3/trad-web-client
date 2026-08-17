<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { compareExact, isExactZero, subtractExact, sumExact } from '@/lib/exactDecimalMath'
import type { PositionProjection, PositionSide } from '@/lib/gateway'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'

const props = defineProps<{
  position: PositionProjection
  side: PositionSide
  accountRevision: number
  cycleId: string
  generation: number
}>()

const accounts = useAccountsStore()
const gateway = useGatewayStore()
const allocations = reactive<Record<string, string>>({})
const busy = ref(false)
const message = ref<string | null>(null)

const deficit = computed(() => props.position.deficit_quantity[props.side])
const scopes = computed(() =>
  Object.values(props.position.owned_exposure).filter(
    (scope) => scope.side === props.side && !isExactZero(scope.remaining_quantity),
  ),
)
const allocated = computed(() =>
  sumExact(scopes.value.map((scope) => allocations[scope.scope_id]?.trim() || '0')),
)
const remainder = computed(() => subtractExact(deficit.value, allocated.value))
const valid = computed(() => {
  if (
    props.position.latest_exchange_event_id === null ||
    exchangeRevision.value === null ||
    scopes.value.length === 0
  ) {
    return false
  }
  if (!isExactZero(remainder.value)) return false
  return scopes.value.every((scope) => {
    const quantity = allocations[scope.scope_id]?.trim() || '0'
    return compareExact(quantity, '0') >= 0 && compareExact(quantity, scope.remaining_quantity) <= 0
  })
})
const exchangeRevision = computed(() =>
  props.side === 'long'
    ? props.position.latest_long_exchange_revision
    : props.position.latest_short_exchange_revision,
)
const allocationBoundary = computed(() =>
  JSON.stringify({
    deficit: deficit.value,
    scopes: scopes.value
      .map((scope) => [scope.scope_id, scope.remaining_quantity])
      .sort(([left], [right]) => left!.localeCompare(right!)),
  }),
)

watch(
  allocationBoundary,
  () => {
    // Fresh equivalent venue evidence keeps the user's exact allocation draft.
    for (const key of Object.keys(allocations)) delete allocations[key]
    message.value = null
  },
)

async function submit(): Promise<void> {
  if (!valid.value || busy.value || accounts.selectedAccountId === null) return
  busy.value = true
  message.value = null
  try {
    const outcome = await gateway.resolvePositionDeficit({
      resolution_id: crypto.randomUUID(),
      expected_account_revision: props.accountRevision,
      cycle_id: props.cycleId,
      generation: props.generation,
      exchange_event_id: props.position.latest_exchange_event_id!,
      exchange_revision: exchangeRevision.value!,
      symbol: props.position.symbol,
      side: props.side,
      reductions: scopes.value
        .map((scope) => ({
          scope_id: scope.scope_id,
          quantity: allocations[scope.scope_id]?.trim() || '0',
        }))
        .filter((reduction) => !isExactZero(reduction.quantity)),
    })
    message.value =
      outcome.kind === 'accepted'
        ? 'Allocation recorded. Trad is refreshing exchange state before reopening risk.'
        : outcome.rejection.code === 'evidence_changed'
          ? 'Exchange evidence changed. Refresh and review the new deficit.'
          : outcome.rejection.reason
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section
    class="deficit-resolution"
    data-testid="position-deficit-resolution"
    :data-side="side"
  >
    <header>
      <div>
        <strong>Allocate {{ deficit }} externally reduced {{ side }}</strong>
        <p>Enter exactly how much disappeared from each Trad-owned exposure.</p>
      </div>
      <span>Unallocated {{ remainder }}</span>
    </header>
    <div v-for="scope in scopes" :key="scope.scope_id" class="allocation-row">
      <label :for="`allocation-${scope.scope_id}`" :title="scope.scope_id">
        {{ scope.scope_id.slice(0, 12) }}
      </label>
      <span>{{ scope.remaining_quantity }} available</span>
      <input
        :id="`allocation-${scope.scope_id}`"
        v-model.trim="allocations[scope.scope_id]"
        inputmode="decimal"
        placeholder="0"
        autocomplete="off"
      />
    </div>
    <footer>
      <span v-if="message" :class="{ danger: !message.startsWith('Allocation recorded') }">
        {{ message }}
      </span>
      <button class="btn btn-sm" type="button" :disabled="!valid || busy" @click="submit">
        {{ busy ? 'Recording...' : 'Confirm exact allocation' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.deficit-resolution {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-warning, #8f6a2a);
  background: color-mix(in srgb, var(--color-warning, #8f6a2a) 8%, transparent);
}

header,
footer,
.allocation-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

header p {
  margin: 3px 0 0;
  color: var(--color-text-dim);
  font-size: 10px;
}

.allocation-row label {
  font-family: var(--font-mono);
}

.allocation-row input {
  width: 120px;
}

footer span {
  font-size: 10px;
}
</style>
