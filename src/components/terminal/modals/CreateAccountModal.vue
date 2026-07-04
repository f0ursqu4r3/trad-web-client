<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { buildAccountFormPayload } from '@/lib/accountFormPayload'
import { enumKeyName } from '@/lib/utils'
import { NetworkType, ExchangeType } from '@/lib/ws/protocol'
import { useAccountsStore, type AccountKeyValidationResponse } from '@/stores/accounts'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const accounts = useAccountsStore()

const DEFAULT_NETWORK: NetworkType = NetworkType.Mainnet
const NETWORK_OPTIONS: NetworkType[] = [NetworkType.Mainnet, NetworkType.Testnet]
const DEFAULT_EXCHANGE: ExchangeType = ExchangeType.Binance
const EXCHANGE_OPTIONS: ExchangeType[] = [
  ExchangeType.Binance,
  ExchangeType.Bifake,
  ExchangeType.Bybit,
]

const network = ref<NetworkType>(DEFAULT_NETWORK)
const exchange = ref<ExchangeType>(DEFAULT_EXCHANGE)
const name = ref('')
const apiKey = ref('')
const secretKey = ref('')
const formError = ref<string | null>(null)
const isSubmitting = ref(false)
const isValidating = ref(false)
const validationResult = ref<AccountKeyValidationResponse | null>(null)
const validationError = ref<string | null>(null)
const isBybit = computed(() => exchange.value === ExchangeType.Bybit)
const hasBybitValidationPass = computed(() => {
  return !isBybit.value || validationResult.value?.valid === true
})

const isSubmitDisabled = computed(() => {
  return (
    !network.value ||
    !name.value.trim() ||
    !apiKey.value.trim() ||
    !secretKey.value.trim() ||
    isValidating.value ||
    !hasBybitValidationPass.value
  )
})

const hasValidationFailure = computed(() => {
  return isBybit.value && validationResult.value !== null && !validationResult.value.valid
})

const keyInputClass = computed(() => ({
  'input-invalid': hasValidationFailure.value || Boolean(validationError.value),
  'input-valid': isBybit.value && validationResult.value?.valid === true,
}))

function reset() {
  network.value = DEFAULT_NETWORK
  exchange.value = DEFAULT_EXCHANGE
  name.value = ''
  apiKey.value = ''
  secretKey.value = ''
  formError.value = null
  isSubmitting.value = false
  isValidating.value = false
  validationResult.value = null
  validationError.value = null
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset()
    }
  },
)

watch([apiKey, secretKey, network, exchange], () => {
  validationResult.value = null
  validationError.value = null
})

function close() {
  emit('close')
}

async function validatePermissions() {
  if (!apiKey.value.trim() || !secretKey.value.trim() || isValidating.value) return
  isValidating.value = true
  validationResult.value = null
  validationError.value = null
  formError.value = null
  try {
    validationResult.value = await accounts.validateAccountKey({
      key: apiKey.value.trim(),
      secret: secretKey.value.trim(),
      network: network.value,
      exchange: exchange.value,
    })
  } catch (err) {
    validationError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isValidating.value = false
  }
}

async function submit() {
  if (isSubmitDisabled.value || isSubmitting.value) return
  if (isBybit.value && validationResult.value?.valid !== true) {
    formError.value = 'Check Bybit key permissions before creating this account.'
    return
  }
  isSubmitting.value = true
  formError.value = null
  try {
    await accounts.addAccount(
      buildAccountFormPayload({
        label: name.value,
        key: apiKey.value,
        secret: secretKey.value,
        network: network.value,
        exchange: exchange.value,
      }),
    )
    close()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseCommandModal title="Create Account" :open="open" @close="close">
    <form id="create-account-form" class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span>Network</span>
          <select v-model="network" class="input">
            <option v-for="option in NETWORK_OPTIONS" :key="option" :value="option">
              {{ enumKeyName(NetworkType, option) || option }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Exchange</span>
          <select v-model="exchange" class="input">
            <option v-for="option in EXCHANGE_OPTIONS" :key="option" :value="option">
              {{ enumKeyName(ExchangeType, option) || option }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Name</span>
          <input
            v-model.trim="name"
            class="input"
            :placeholder="isBybit ? 'Exchange key label' : 'Account alias'"
          />
        </label>
        <div v-if="isBybit" class="field">
          <span>Product</span>
          <div class="readonly-value">USDT Perpetuals</div>
        </div>
        <label class="field">
          <span>API Key</span>
          <input v-model.trim="apiKey" class="input" :class="keyInputClass" placeholder="API key" />
        </label>
        <label class="field">
          <span>Secret Key</span>
          <input
            v-model.trim="secretKey"
            class="input"
            :class="keyInputClass"
            placeholder="Secret key"
          />
        </label>
        <p class="col-span-2 text-[11px] text-[var(--color-text-dim)] leading-relaxed">
          Your keys are stored securely and are only accessible by the trading backend. Double-check
          the network matches the exchange the keys belong to.
        </p>
        <div v-if="isBybit" class="col-span-2 permission-note">
          <div class="permission-note-title">Required Bybit key scope</div>
          <div class="permission-note-grid">
            <span>Read account data</span>
            <span>Read orders and positions</span>
            <span>Create/cancel contract orders</span>
            <span>Withdrawals disabled</span>
          </div>
        </div>
        <div v-if="isBybit" class="col-span-2 validation-panel" :class="{
          'validation-panel-valid': validationResult?.valid,
          'validation-panel-invalid': hasValidationFailure || validationError,
        }">
          <div class="validation-header">
            <div>
              <div class="validation-title">Bybit permission check</div>
              <div class="validation-copy">
                Validate this key before saving. If permissions are changed on Bybit, run the check
                again.
              </div>
            </div>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="isValidating || !apiKey.trim() || !secretKey.trim()"
              @click="validatePermissions"
            >
              <span v-if="isValidating">Checking...</span>
              <span v-else>Check permissions</span>
            </button>
          </div>
          <div v-if="validationResult?.valid" class="validation-success">
            Key permissions are valid for Bybit USDT perpetual trading.
          </div>
          <div v-if="validationError" class="validation-error">
            {{ validationError }}
          </div>
          <div v-if="hasValidationFailure && validationResult" class="validation-details">
            <div v-if="validationResult.missing_requirements.length">
              <div class="validation-section-title">Missing</div>
              <ul>
                <li v-for="item in validationResult.missing_requirements" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div v-if="validationResult.warnings.length">
              <div class="validation-section-title">Change on Bybit</div>
              <ul>
                <li v-for="item in validationResult.warnings" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div v-if="validationResult.present_permissions.length">
              <div class="validation-section-title">Detected</div>
              <div class="permission-chip-row">
                <span
                  v-for="item in validationResult.present_permissions"
                  :key="item"
                  class="permission-chip"
                >
                  {{ item }}
                </span>
              </div>
            </div>
            <div v-if="validationResult.exchange_message" class="validation-copy">
              Bybit: {{ validationResult.exchange_message }}
            </div>
          </div>
        </div>
      </div>
      <p v-if="formError" class="text-xs text-red-400">{{ formError }}</p>
    </form>
    <template #footer>
      <div class="flex gap-2 justify-end pt-2">
        <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
        <button
          form="create-account-form"
          type="submit"
          class="btn btn-primary"
          :disabled="isSubmitDisabled || isSubmitting"
        >
          <span v-if="isSubmitting">Creating...</span>
          <span v-else>Create</span>
        </button>
      </div>
    </template>
  </BaseCommandModal>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 12px;
}

.field > span {
  color: var(--color-text-dim);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input {
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-input);
  padding: 0.35rem 0.5rem;
  font: inherit;
  font-size: 12px;
  color: var(--color-text);
}

.input:focus {
  outline: 1px solid var(--accent-color);
  outline-offset: 1px;
}

.input-invalid {
  border-color: color-mix(in srgb, #f87171 75%, var(--border-color));
}

.input-valid {
  border-color: color-mix(in srgb, #22c55e 70%, var(--border-color));
}

.readonly-value {
  min-height: 30px;
  display: flex;
  align-items: center;
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-input);
  padding: 0.35rem 0.5rem;
  font-size: 12px;
  color: var(--color-text);
}

.permission-note {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-panel);
  padding: 0.5rem;
  background: color-mix(in srgb, var(--panel-header-bg) 60%, transparent);
}

.permission-note-title {
  font-size: 11px;
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.4rem;
}

.permission-note-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem 0.5rem;
  font-size: 11px;
  color: var(--color-text);
}

.permission-note-grid span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.validation-panel {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-panel);
  padding: 0.55rem;
  background: color-mix(in srgb, var(--panel-header-bg) 50%, transparent);
}

.validation-panel-valid {
  border-color: color-mix(in srgb, #22c55e 60%, var(--border-color));
}

.validation-panel-invalid {
  border-color: color-mix(in srgb, #f87171 70%, var(--border-color));
}

.validation-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.validation-title,
.validation-section-title {
  font-size: 11px;
  color: var(--color-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.validation-copy {
  margin-top: 0.2rem;
  font-size: 11px;
  color: var(--color-text-dim);
  line-height: 1.35;
}

.validation-success {
  margin-top: 0.5rem;
  font-size: 11px;
  color: #86efac;
}

.validation-error {
  margin-top: 0.5rem;
  font-size: 11px;
  color: #fca5a5;
}

.validation-details {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.55rem;
  font-size: 11px;
  color: var(--color-text);
}

.validation-details ul {
  margin: 0.25rem 0 0;
  padding-left: 1rem;
}

.permission-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.3rem;
}

.permission-chip {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-input);
  padding: 0.15rem 0.35rem;
  color: var(--color-text);
  background: color-mix(in srgb, var(--panel-header-bg) 70%, transparent);
  overflow-wrap: anywhere;
}

button[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
