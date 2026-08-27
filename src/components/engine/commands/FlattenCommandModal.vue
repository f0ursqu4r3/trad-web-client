<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import MarketSymbolCombobox from '@/components/forms/MarketSymbolCombobox.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import { useTelemetryAction } from '@/composables/useTelemetryAction'
import { buildFlattenIntent } from '@/lib/engineCommands/intents'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import FormField from '@/components/forms/FormField.vue'
import { symbolError } from '@/lib/formValidation'

const props = withDefaults(
  defineProps<{
    open: boolean
    initialAccountId?: string
    initialTarget?: 'symbol' | 'account'
    initialSymbol?: string
  }>(),
  { initialAccountId: '', initialTarget: 'symbol', initialSymbol: '' },
)
const emit = defineEmits<{ (event: 'close'): void }>()
const accounts = useAccountsStore()
const gateway = useGatewayStore()
const submission = useEngineCommandSubmission()
const selectedAccountId = ref('')
const telemetryAction = useTelemetryAction({
  open: () => props.open,
  accountId: () => selectedAccountId.value || null,
  actionKind: () => 'flatten',
  source: 'flatten_modal',
})
const targetKind = ref<'symbol' | 'account'>('symbol')
const symbol = ref('')
const validationError = ref<string | null>(null)
const catalogSymbolError = ref<string | null>(null)
const selectedAccount = computed(
  () => accounts.accounts.find((account) => account.id === selectedAccountId.value) ?? null,
)
const accountError = computed(() =>
  selectedAccountId.value === '' ? 'Trading account is required' : null,
)
const flattenSymbolError = computed(() =>
  targetKind.value === 'symbol' ? symbolError(symbol.value) || catalogSymbolError.value : null,
)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    selectedAccountId.value !== '' &&
    flattenSymbolError.value === null &&
    !submission.submitting.value,
)

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

watch(selectedAccountId, (accountId, prior) => {
  const isInitialContext =
    props.open &&
    props.initialSymbol !== '' &&
    accountId === props.initialAccountId &&
    symbol.value === props.initialSymbol
  if (accountId !== '' && accountId !== prior && !isInitialContext)
    symbol.value = accounts.getDefaultSymbolForAccount(accountId)
})

function reset(): void {
  selectedAccountId.value =
    props.initialAccountId || accounts.selectedAccountId || accounts.accounts[0]?.id || ''
  targetKind.value = props.initialTarget
  symbol.value = props.initialSymbol || accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  validationError.value = null
  submission.clearSubmissionError()
}

async function submit(): Promise<void> {
  validationError.value = null
  const actionAttemptId = telemetryAction.confirm()
  try {
    const intent = buildFlattenIntent(targetKind.value, symbol.value)
    if (await submission.submit({ accountId: selectedAccountId.value, intent }, actionAttemptId)) {
      emit('close')
    }
  } catch (error) {
    telemetryAction.validationFailed()
    validationError.value = error instanceof Error ? error.message : String(error)
  }
}

function closeModal(): void {
  telemetryAction.cancel()
  emit('close')
}
</script>

<template>
  <BaseCommandModal title="Flatten Exposure" :open="open" @close="closeModal">
    <form id="engine-flatten" class="command-form" @submit.prevent="submit">
      <FormField
        label="Account"
        help="The configured exchange account whose exposure will be closed."
        :error="accountError"
        required
      >
        <select v-model="selectedAccountId" class="input">
          <option v-for="account in accounts.accounts" :key="account.id" :value="account.id">
            {{ account.label }} · {{ account.exchange }} · {{ account.network }}
          </option>
        </select>
      </FormField>
      <FormField
        label="Target"
        help="Close one instrument or all exposure held by this account."
        required
      >
        <select v-model="targetKind" class="input">
          <option value="symbol">One Symbol</option>
          <option value="account">Entire Account</option>
        </select>
      </FormField>
      <FormField
        v-if="targetKind === 'symbol'"
        label="Symbol"
        help="Exchange instrument whose exposure and related protection will be closed."
        :error="flattenSymbolError"
        required
      >
        <MarketSymbolCombobox
          v-model="symbol"
          :account="selectedAccount"
          aria-label="Symbol"
          @validity="catalogSymbolError = $event"
        />
      </FormField>
      <p class="warning">
        This creates authoritative reduce-only close workflows and clears related protection. It
        does not submit new directional exposure.
      </p>
      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>
    <template #footer>
      <button class="btn" type="button" @click="closeModal">Cancel</button>
      <button class="btn btn-danger" type="submit" form="engine-flatten" :disabled="!canSubmit">
        {{ submission.submitting.value ? 'Submitting…' : 'Flatten' }}
      </button>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.command-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.warning,
.submission-error {
  grid-column: 1 / -1;
}
.warning {
  margin: 0;
  color: var(--color-warning);
}
.submission-error {
  color: var(--color-error);
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .command-form {
    grid-template-columns: 1fr;
  }
}
</style>
