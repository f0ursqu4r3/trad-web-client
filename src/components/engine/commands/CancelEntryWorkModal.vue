<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import MarketSymbolCombobox from '@/components/forms/MarketSymbolCombobox.vue'
import { useEngineCommandSubmission } from '@/composables/useEngineCommandSubmission'
import { useTelemetryAction } from '@/composables/useTelemetryAction'
import { buildCancelEntryWorkIntent } from '@/lib/engineCommands/intents'
import { useAccountsStore } from '@/stores/accounts'
import { useGatewayStore } from '@/stores/gateway'
import FormField from '@/components/forms/FormField.vue'
import { symbolError } from '@/lib/formValidation'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()
const accounts = useAccountsStore()
const gateway = useGatewayStore()
const submission = useEngineCommandSubmission()
const selectedAccountId = ref('')
const telemetryAction = useTelemetryAction({
  open: () => props.open,
  accountId: () => selectedAccountId.value || null,
  actionKind: () => 'cancel',
  source: 'cancel_entry_modal',
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
const cancelSymbolError = computed(() =>
  targetKind.value === 'symbol' ? symbolError(symbol.value) || catalogSymbolError.value : null,
)
const canSubmit = computed(
  () =>
    gateway.isConnected &&
    selectedAccountId.value !== '' &&
    cancelSymbolError.value === null &&
    !submission.submitting.value,
)

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

watch(selectedAccountId, (accountId, prior) => {
  if (accountId !== '' && accountId !== prior)
    symbol.value = accounts.getDefaultSymbolForAccount(accountId)
})

function reset(): void {
  selectedAccountId.value = accounts.selectedAccountId ?? accounts.accounts[0]?.id ?? ''
  targetKind.value = 'symbol'
  symbol.value = accounts.getDefaultSymbolForAccount(selectedAccountId.value)
  validationError.value = null
  submission.clearSubmissionError()
}

async function submit(): Promise<void> {
  validationError.value = null
  const actionAttemptId = telemetryAction.confirm()
  try {
    const intent = buildCancelEntryWorkIntent(targetKind.value, symbol.value)
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
  <BaseCommandModal title="Cancel Entry Work" :open="open" @close="closeModal">
    <form id="engine-cancel-entry-work" class="command-form" @submit.prevent="submit">
      <FormField
        label="Account"
        help="The configured exchange account whose unfilled entry work will be canceled."
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
        help="Cancel entry work for one instrument or across the entire account."
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
        help="Exchange instrument whose unfilled entry work will be canceled."
        :error="cancelSymbolError"
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
        Cancels unfilled entry Orders, active Chases, and Trailing Entries that have not established
        a position. Existing exposure and its active protection remain in place.
      </p>
      <p v-if="validationError || submission.submissionError.value" class="submission-error">
        {{ validationError || submission.submissionError.value }}
      </p>
    </form>
    <template #footer>
      <button class="btn" type="button" @click="closeModal">Back</button>
      <button
        class="btn btn-danger"
        type="submit"
        form="engine-cancel-entry-work"
        :disabled="!canSubmit"
      >
        {{ submission.submitting.value ? 'Submitting…' : 'Cancel Entry Work' }}
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
