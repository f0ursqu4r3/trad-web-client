<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import type { TakeProfitAllocation, TakeProfitLadder } from '@/lib/ws/protocol'

type AllocationMode = 'fraction' | 'base'
type LadderRow = {
  legId: string
  triggerPrice: number | null
  mode: AllocationMode
  value: number | null
}

const props = withDefaults(
  defineProps<{ modelValue: TakeProfitLadder | null; lockStructure?: boolean }>(),
  { lockStructure: false },
)
const emit = defineEmits<{
  (event: 'update:modelValue', value: TakeProfitLadder | null): void
  (event: 'validity', value: boolean): void
}>()

const rows = ref<LadderRow[]>([])
const generateStart = ref<number | null>(null)
const generateEnd = ref<number | null>(null)
const generateSteps = ref(3)
const generateMode = ref<AllocationMode>('fraction')
const generateTotal = ref<number | null>(100)
let applyingExternal = false

function newLegId(): string {
  return crypto.randomUUID()
}

function rowFromAllocation(
  legId: string,
  triggerPrice: number,
  allocation: TakeProfitAllocation,
): LadderRow {
  return allocation.kind === 'fraction'
    ? { legId, triggerPrice, mode: 'fraction', value: allocation.value * 100 }
    : { legId, triggerPrice, mode: 'base', value: allocation.value }
}

watch(
  () => props.modelValue,
  (ladder) => {
    applyingExternal = true
    rows.value =
      ladder?.legs.map((leg) => rowFromAllocation(leg.leg_id, leg.trigger_price, leg.allocation)) ??
      []
    queueMicrotask(() => {
      applyingExternal = false
    })
  },
  { immediate: true, deep: true },
)

const validationError = computed(() => {
  if (rows.value.length === 0) return 'Add at least one take-profit level.'
  const ids = new Set<string>()
  let fractionTotal = 0
  for (const row of rows.value) {
    if (!row.legId || ids.has(row.legId)) return 'Take-profit leg IDs must be unique.'
    ids.add(row.legId)
    if (row.triggerPrice == null || !Number.isFinite(row.triggerPrice) || row.triggerPrice <= 0) {
      return 'Every take-profit level needs a positive trigger price.'
    }
    if (row.value == null || !Number.isFinite(row.value) || row.value <= 0) {
      return 'Every take-profit level needs a positive allocation.'
    }
    if (row.mode === 'fraction') {
      if (row.value > 100) return 'A percentage allocation cannot exceed 100%.'
      fractionTotal += row.value
    }
  }
  if (fractionTotal > 100 + 1e-7) {
    return `Percentage allocations total ${fractionTotal.toFixed(3)}%, above 100%.`
  }
  return null
})

function toLadder(): TakeProfitLadder | null {
  if (validationError.value) return null
  return {
    version: 1,
    legs: rows.value.map((row) => ({
      leg_id: row.legId,
      trigger_price: row.triggerPrice!,
      allocation:
        row.mode === 'fraction'
          ? { kind: 'fraction', value: row.value! / 100 }
          : { kind: 'base', value: row.value! },
    })),
  }
}

watch(
  rows,
  () => {
    if (applyingExternal) return
    const ladder = toLadder()
    emit('validity', ladder !== null)
    if (ladder) emit('update:modelValue', ladder)
  },
  { deep: true },
)

function addRow() {
  rows.value.push({ legId: newLegId(), triggerPrice: null, mode: 'fraction', value: 100 })
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
}

function generate() {
  const start = generateStart.value
  const end = generateEnd.value
  const steps = Math.trunc(generateSteps.value)
  const total = generateTotal.value
  if (
    start == null ||
    end == null ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start <= 0 ||
    end <= 0 ||
    total == null ||
    !Number.isFinite(total) ||
    total <= 0 ||
    (generateMode.value === 'fraction' && total > 100) ||
    steps < 1 ||
    steps > 20
  ) {
    return
  }
  const increment = steps === 1 ? 0 : (end - start) / (steps - 1)
  const allocation = total / steps
  rows.value = Array.from({ length: steps }, (_, index) => ({
    legId: newLegId(),
    triggerPrice: start + increment * index,
    mode: generateMode.value,
    value: allocation,
  }))
}
</script>

<template>
  <section
    data-testid="take-profit-ladder-editor"
    class="col-span-2 border border-[var(--color-border)] p-2 space-y-2"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-[11px] uppercase text-[var(--color-text-dim)]">Take-profit ladder</span>
      <button
        v-if="!lockStructure"
        type="button"
        class="btn btn-secondary px-2 py-1"
        title="Add take-profit level"
        @click="addRow"
      >
        <Plus :size="14" />
      </button>
    </div>

    <div
      class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] uppercase text-[var(--color-text-dim)]"
    >
      <span>Trigger price</span><span>Allocation</span><span>Unit</span><span></span>
    </div>
    <div
      v-for="(row, index) in rows"
      :key="row.legId"
      data-testid="take-profit-ladder-row"
      class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center"
    >
      <input v-model.number="row.triggerPrice" type="number" min="0" step="any" class="input" />
      <input v-model.number="row.value" type="number" min="0" step="any" class="input" />
      <select v-model="row.mode" class="input">
        <option value="fraction">Percent</option>
        <option value="base">Base qty</option>
      </select>
      <button
        v-if="!lockStructure"
        type="button"
        class="btn btn-secondary px-2 py-1"
        title="Remove take-profit level"
        @click="removeRow(index)"
      >
        <Trash2 :size="14" />
      </button>
    </div>

    <div
      v-if="!lockStructure"
      class="grid grid-cols-2 gap-2 items-end border-t border-[var(--color-border)] pt-2 sm:grid-cols-[1fr_1fr_5rem_7rem_7rem_auto]"
    >
      <label class="field"
        ><span>Start</span
        ><input v-model.number="generateStart" type="number" min="0" step="any" class="input"
      /></label>
      <label class="field"
        ><span>End</span
        ><input v-model.number="generateEnd" type="number" min="0" step="any" class="input"
      /></label>
      <label class="field"
        ><span>Steps</span
        ><input
          v-model.number="generateSteps"
          type="number"
          min="1"
          max="20"
          step="1"
          class="input"
      /></label>
      <label class="field"
        ><span>Allocation</span
        ><select v-model="generateMode" class="input">
          <option value="fraction">Percent</option>
          <option value="base">Base qty</option>
        </select></label
      >
      <label class="field"
        ><span>Total</span
        ><input v-model.number="generateTotal" type="number" min="0" step="any" class="input"
      /></label>
      <button type="button" class="btn btn-secondary" @click="generate">Generate</button>
    </div>
    <p v-if="validationError" class="m-0 text-[11px] text-error">{{ validationError }}</p>
  </section>
</template>
