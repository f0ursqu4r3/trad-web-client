<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { useWsStore } from '@/stores/ws'
import {
  TrailingEntryLifecycle,
  TrailingEntryPhase,
  type SplitSettings,
  type TrailingEntrySnapshot,
} from '@/lib/ws/protocol'

const props = defineProps<{
  open: boolean
  deviceId: string
  device: TrailingEntrySnapshot
}>()

const emit = defineEmits<{ (event: 'close'): void }>()
const ws = useWsStore()
const submittedRevision = ref<number | null>(null)
const error = ref<string | null>(null)
const form = reactive({
  activationPrice: 0,
  jumpThreshold: 0,
  stopLoss: 0,
  takeProfit: '',
  riskAmount: 0,
  targetChildNotional: '',
  maxSplitsCap: '',
  slippageMargin: '',
})

function load() {
  form.activationPrice = props.device.activation_price
  form.jumpThreshold = props.device.jump_frac_threshold
  form.stopLoss = props.device.stop_loss
  form.takeProfit = props.device.take_profit == null ? '' : String(props.device.take_profit)
  form.riskAmount = props.device.risk_amount
  form.targetChildNotional =
    props.device.split_settings?.target_child_notional == null
      ? ''
      : String(props.device.split_settings.target_child_notional)
  form.maxSplitsCap =
    props.device.split_settings?.max_splits_cap == null
      ? ''
      : String(props.device.split_settings.max_splits_cap)
  form.slippageMargin =
    props.device.split_settings?.slippage_margin == null
      ? ''
      : String(props.device.split_settings.slippage_margin)
  error.value = null
}

watch(() => [props.open, props.deviceId] as const, load, { immediate: true })
watch(
  () => props.device.state_revision ?? 0,
  (revision) => {
    if (submittedRevision.value !== null && revision > submittedRevision.value) {
      submittedRevision.value = null
      emit('close')
    }
  },
)

const activationEditable = computed(() => props.device.phase === TrailingEntryPhase.Initial)
const pending = computed(() => submittedRevision.value !== null)

function optionalPositive(value: string, label: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`)
  }
  return parsed
}

function submit() {
  try {
    for (const [label, value] of [
      ['Activation price', form.activationPrice],
      ['Jump threshold', form.jumpThreshold],
      ['Stop loss', form.stopLoss],
      ['Risk amount', form.riskAmount],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive.`)
    }
    const takeProfit = optionalPositive(form.takeProfit, 'Take profit')
    const targetChildNotional = optionalPositive(
      form.targetChildNotional,
      'Target child notional',
    )
    const maxSplitsCap = optionalPositive(form.maxSplitsCap, 'Max splits')
    const slippageMargin = optionalPositive(form.slippageMargin, 'Slippage margin')
    const hasSplitSettings =
      targetChildNotional !== null || maxSplitsCap !== null || slippageMargin !== null
    const splitSettings: SplitSettings | undefined = hasSplitSettings
      ? {
          target_child_notional: targetChildNotional,
          max_splits_cap: maxSplitsCap === null ? null : Math.floor(maxSplitsCap),
          mode: props.device.split_settings?.mode ?? null,
          slippage_margin: slippageMargin,
        }
      : undefined

    const revision = props.device.state_revision ?? 0
    submittedRevision.value = revision
    error.value = null
    ws.sendUserCommand({
      kind: 'AmendTrailingEntry',
      data: {
        device_id: props.deviceId,
        expected_revision: revision,
        expected_phase: props.device.phase,
        expected_lifecycle: props.device.lifecycle ?? TrailingEntryLifecycle.Running,
        activation_price: activationEditable.value ? form.activationPrice : undefined,
        jump_frac_threshold: form.jumpThreshold,
        stop_loss: form.stopLoss,
        take_profit: takeProfit ?? undefined,
        clear_take_profit: takeProfit === null,
        risk_amount: form.riskAmount,
        split_settings: splitSettings,
      },
    })
    window.setTimeout(() => {
      if (submittedRevision.value === revision) {
        submittedRevision.value = null
        error.value =
          'The backend did not confirm this edit. Refresh the command before trying again.'
      }
    }, 10_000)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  }
}
</script>

<template>
  <BaseCommandModal title="Edit Trailing Entry" :open="open" @close="emit('close')">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="field">
        <span>Activation price</span>
        <input
          v-model.number="form.activationPrice"
          type="number"
          step="any"
          :disabled="!activationEditable || pending"
        />
        <small v-if="!activationEditable">Historical after trailing begins.</small>
      </label>
      <label class="field">
        <span>Jump threshold (%)</span>
        <input v-model.number="form.jumpThreshold" type="number" step="any" :disabled="pending" />
      </label>
      <label class="field">
        <span>Stop loss</span>
        <input v-model.number="form.stopLoss" type="number" step="any" :disabled="pending" />
      </label>
      <label class="field">
        <span>Take profit</span>
        <input v-model="form.takeProfit" type="number" step="any" :disabled="pending" />
        <small>Leave blank to remove.</small>
      </label>
      <label class="field">
        <span>Risk amount</span>
        <input v-model.number="form.riskAmount" type="number" step="any" :disabled="pending" />
      </label>
      <div class="hidden sm:block" />
      <label class="field">
        <span>Target child notional</span>
        <input v-model="form.targetChildNotional" type="number" step="any" :disabled="pending" />
      </label>
      <label class="field">
        <span>Max splits</span>
        <input v-model="form.maxSplitsCap" type="number" step="1" :disabled="pending" />
      </label>
      <label class="field">
        <span>Slippage margin</span>
        <input v-model="form.slippageMargin" type="number" step="any" :disabled="pending" />
      </label>
    </div>
    <p v-if="error" class="mt-3 text-[12px] text-[var(--color-error)]">{{ error }}</p>
    <p v-else-if="pending" class="mt-3 text-[12px] text-[var(--color-warning)]">
      Waiting for the authoritative TE actor...
    </p>
    <template #footer>
      <button type="button" class="btn btn-secondary" :disabled="pending" @click="emit('close')">
        Cancel
      </button>
      <button type="button" class="btn btn-primary" :disabled="pending" @click="submit">
        Apply
      </button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: 11px;
}
.field input {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--color-text);
  padding: 5px 7px;
}
.field small {
  font-size: 10px;
}
</style>
