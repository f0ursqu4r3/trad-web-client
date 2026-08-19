<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { buildAccountFormPayload } from '@/lib/accountFormPayload'
import { enumKeyName } from '@/lib/utils'
import { NetworkType, ExchangeType } from '@/lib/ws/protocol'
import { useAccountsStore, type AccountKeyValidationResponse } from '@/stores/accounts'
import { HYPERLIQUID_TARGET_TOTAL_DEFAULT_TENTHS_BPS } from '@/lib/accountMetadata'
import FormField from '@/components/forms/FormField.vue'
import { integerError, requiredText } from '@/lib/formValidation'

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
  ExchangeType.Hyperliquid,
]

const network = ref<NetworkType>(DEFAULT_NETWORK)
const exchange = ref<ExchangeType>(DEFAULT_EXCHANGE)
const name = ref('')
const apiKey = ref('')
const secretKey = ref('')
const hyperliquidAgentMode = ref<'generated' | 'existing'>('generated')
const hyperliquidVaultAddress = ref('')
const hyperliquidDefaultLeverage = ref('1')
const hyperliquidMarginMode = ref<'cross' | 'isolated'>('cross')
const formError = ref<string | null>(null)
const isSubmitting = ref(false)
const isValidating = ref(false)
const validationResult = ref<AccountKeyValidationResponse | null>(null)
const validationError = ref<string | null>(null)
const isBybit = computed(() => exchange.value === ExchangeType.Bybit)
const isHyperliquid = computed(() => exchange.value === ExchangeType.Hyperliquid)
const requiresValidation = computed(() => isBybit.value || isHyperliquid.value)
const requiresSecret = computed(
  () => !isHyperliquid.value || hyperliquidAgentMode.value === 'existing',
)
const hasKeyValidationPass = computed(() => {
  return !requiresValidation.value || validationResult.value?.valid === true
})
const keyLabel = computed(() => (isHyperliquid.value ? 'User Wallet Address' : 'API Key'))
const secretLabel = computed(() => (isHyperliquid.value ? 'Agent Private Key' : 'Secret Key'))
const keyPlaceholder = computed(() => (isHyperliquid.value ? '0x...' : 'API key'))
const secretPlaceholder = computed(() =>
  isHyperliquid.value ? '32-byte hex private key' : 'Secret key',
)
const productLabel = computed(() => (isHyperliquid.value ? 'USDC Perpetuals' : 'USDT Perpetuals'))
const validationTitle = computed(() =>
  isHyperliquid.value ? 'Hyperliquid key check' : 'Bybit permission check',
)
const validationCopy = computed(() =>
  isHyperliquid.value
    ? hyperliquidAgentMode.value === 'generated'
      ? 'Validate the wallet and read-only Hyperliquid account-state access. Trad generates and encrypts the agent key only when the account is saved; agent and builder approvals follow with wallet signatures.'
      : 'Validate the wallet address, derived existing agent wallet, and read-only Hyperliquid account-state access before saving. Agent and builder approvals are handled separately with wallet signatures.'
    : 'Validate this key before saving. If permissions are changed on Bybit, run the check again.',
)
const validationSuccess = computed(() =>
  isHyperliquid.value
    ? hyperliquidAgentMode.value === 'generated'
      ? 'Wallet and read-only account access are valid. The agent key will be generated securely when saved.'
      : 'Wallet, existing agent key, and read-only Hyperliquid account-state access are valid.'
    : 'Key permissions are valid for Bybit USDT perpetual trading.',
)
const defaultLeverage = computed(() => {
  const parsed = Number(hyperliquidDefaultLeverage.value)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
})
const isHyperliquidMetadataValid = computed(() => {
  if (!isHyperliquid.value) return true
  return defaultLeverage.value !== null
})
const nameError = computed(() => requiredText(name.value, 'Account name'))
const keyError = computed(() => {
  const missing = requiredText(apiKey.value, keyLabel.value)
  if (missing) return missing
  if (hasValidationFailure.value)
    return validationResult.value?.exchange_message || 'Permission check failed'
  if (validationError.value) return validationError.value
  return null
})
const secretError = computed(() =>
  requiresSecret.value ? requiredText(secretKey.value, secretLabel.value) : null,
)
const leverageError = computed(() =>
  isHyperliquid.value
    ? integerError(hyperliquidDefaultLeverage.value, 'Default leverage', 1)
    : null,
)
const permissionError = computed(() => {
  if (!requiresValidation.value || !apiKey.value.trim() || secretError.value) return null
  return validationResult.value?.valid === true ? null : 'Run and pass the permission check'
})

const isSubmitDisabled = computed(() => {
  return (
    !network.value ||
    !name.value.trim() ||
    !apiKey.value.trim() ||
    (requiresSecret.value && !secretKey.value.trim()) ||
    isValidating.value ||
    !hasKeyValidationPass.value ||
    !isHyperliquidMetadataValid.value
  )
})

const hasValidationFailure = computed(() => {
  return (
    requiresValidation.value && validationResult.value !== null && !validationResult.value.valid
  )
})

const keyInputClass = computed(() => ({
  'input-invalid': hasValidationFailure.value || Boolean(validationError.value),
  'input-valid': requiresValidation.value && validationResult.value?.valid === true,
}))

function reset() {
  network.value = DEFAULT_NETWORK
  exchange.value = DEFAULT_EXCHANGE
  name.value = ''
  apiKey.value = ''
  secretKey.value = ''
  hyperliquidAgentMode.value = 'generated'
  hyperliquidVaultAddress.value = ''
  hyperliquidDefaultLeverage.value = '1'
  hyperliquidMarginMode.value = 'cross'
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

watch([apiKey, secretKey, network, exchange, hyperliquidAgentMode], () => {
  validationResult.value = null
  validationError.value = null
})

function close() {
  emit('close')
}

async function validatePermissions() {
  if (
    !apiKey.value.trim() ||
    (requiresSecret.value && !secretKey.value.trim()) ||
    isValidating.value
  )
    return
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
      exchange_metadata: buildExchangeMetadata(),
      ...(isHyperliquid.value
        ? { generate_hyperliquid_agent_key: hyperliquidAgentMode.value === 'generated' }
        : {}),
    })
  } catch (err) {
    validationError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isValidating.value = false
  }
}

async function submit() {
  if (isSubmitDisabled.value || isSubmitting.value) return
  if (requiresValidation.value && validationResult.value?.valid !== true) {
    formError.value = isHyperliquid.value
      ? 'Check the Hyperliquid wallet and agent setup before creating this account.'
      : 'Check Bybit key permissions before creating this account.'
    return
  }
  isSubmitting.value = true
  formError.value = null
  try {
    const createdAccount = await accounts.addAccount(
      buildAccountFormPayload({
        label: name.value,
        key: apiKey.value,
        secret: secretKey.value,
        network: network.value,
        exchange: exchange.value,
        exchange_metadata: buildExchangeMetadata(),
        ...(isHyperliquid.value
          ? { generate_hyperliquid_agent_key: hyperliquidAgentMode.value === 'generated' }
          : {}),
      }),
    )
    if (createdAccount) {
      accounts.selectedAccountId = createdAccount.id
    }
    close()
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isSubmitting.value = false
  }
}

function buildExchangeMetadata() {
  if (!isHyperliquid.value) return null
  return {
    product: 'usdc_perp',
    hedge_mode_only: false,
    vault_address: hyperliquidVaultAddress.value.trim() || null,
    builder_target_total_tenths_bps: HYPERLIQUID_TARGET_TOTAL_DEFAULT_TENTHS_BPS,
    builder_approved: false,
    agent_approved: false,
    default_leverage: defaultLeverage.value,
    margin_mode: hyperliquidMarginMode.value,
    entry_market_guard_tenths_bps: 500,
    take_profit_market_guard_tenths_bps: 1000,
    stop_loss_market_guard_tenths_bps: 10000,
  }
}
</script>

<template>
  <BaseCommandModal title="Create Account" :open="open" @close="close">
    <form id="create-account-form" class="space-y-4" @submit.prevent="submit">
      <div class="grid grid-cols-2 gap-3">
        <FormField
          label="Network"
          help="The exchange environment this account belongs to."
          required
        >
          <select v-model="network" class="input">
            <option v-for="option in NETWORK_OPTIONS" :key="option" :value="option">
              {{ enumKeyName(NetworkType, option) || option }}
            </option>
          </select>
        </FormField>
        <FormField
          label="Exchange"
          help="The venue Trad will connect to for this account."
          required
        >
          <select v-model="exchange" class="input">
            <option v-for="option in EXCHANGE_OPTIONS" :key="option" :value="option">
              {{ enumKeyName(ExchangeType, option) || option }}
            </option>
          </select>
        </FormField>
        <FormField
          label="Name"
          help="A short label used to identify this account throughout Trad."
          :error="nameError"
          required
        >
          <input
            v-model.trim="name"
            class="input"
            :placeholder="isBybit ? 'Exchange key label' : 'Account alias'"
          />
        </FormField>
        <div v-if="isBybit" class="field">
          <span>Product</span>
          <div class="readonly-value">USDT Perpetuals</div>
        </div>
        <div v-else-if="isHyperliquid" class="field">
          <span>Product</span>
          <div class="readonly-value">{{ productLabel }}</div>
        </div>
        <FormField
          :label="keyLabel"
          :help="
            isHyperliquid
              ? 'The public address of the main Hyperliquid account.'
              : 'The exchange API key Trad will use for this account.'
          "
          :error="keyError"
          required
        >
          <input
            v-model.trim="apiKey"
            class="input"
            :class="keyInputClass"
            :placeholder="keyPlaceholder"
          />
        </FormField>
        <div v-if="isHyperliquid" class="field col-span-2">
          <span>Agent Key Source</span>
          <div class="input-action-row" role="group" aria-label="Agent Key Source">
            <button
              type="button"
              class="btn flex-1"
              :class="hyperliquidAgentMode === 'generated' ? 'btn-primary' : 'btn-secondary'"
              :aria-pressed="hyperliquidAgentMode === 'generated'"
              @click="hyperliquidAgentMode = 'generated'"
            >
              Generate securely
            </button>
            <button
              type="button"
              class="btn flex-1"
              :class="hyperliquidAgentMode === 'existing' ? 'btn-primary' : 'btn-secondary'"
              :aria-pressed="hyperliquidAgentMode === 'existing'"
              @click="hyperliquidAgentMode = 'existing'"
            >
              Use existing
            </button>
          </div>
          <small class="field-hint">
            <template v-if="hyperliquidAgentMode === 'generated'">
              Trad generates the private key while saving and stores it encrypted. It is never sent
              to this browser.
            </template>
            <template v-else>
              Use a dedicated Hyperliquid API wallet key. The key is sent once over the
              authenticated connection and stored encrypted.
            </template>
          </small>
        </div>
        <FormField
          v-if="requiresSecret"
          :label="secretLabel"
          :help="
            isHyperliquid
              ? 'The private key for a dedicated Hyperliquid API wallet, never the main wallet key.'
              : 'The secret paired with this exchange API key.'
          "
          :error="secretError"
          required
        >
          <input
            v-model.trim="secretKey"
            class="input"
            :class="keyInputClass"
            type="password"
            autocomplete="new-password"
            :placeholder="secretPlaceholder"
          />
        </FormField>
        <template v-if="isHyperliquid">
          <FormField
            label="Vault/Subaccount"
            help="Optional Hyperliquid vault address. Leave blank to trade the main account."
            optional
          >
            <input
              v-model.trim="hyperliquidVaultAddress"
              class="input"
              placeholder="Optional 0x vault address"
            />
          </FormField>
          <FormField
            label="Default Leverage"
            help="The leverage Trad applies by default when no symbol override exists."
            :error="leverageError"
            required
          >
            <input
              v-model.trim="hyperliquidDefaultLeverage"
              class="input"
              type="number"
              min="1"
              step="1"
              placeholder="1"
            />
          </FormField>
          <FormField
            label="Margin Mode"
            help="Cross shares account margin; isolated limits margin to the position."
            required
          >
            <select v-model="hyperliquidMarginMode" class="input">
              <option value="cross">Cross</option>
              <option value="isolated">Isolated</option>
            </select>
          </FormField>
          <div class="field">
            <span>Builder Recipient</span>
            <div class="readonly-value">Trad configured</div>
          </div>
          <div class="field">
            <span>Target Total / Side</span>
            <div class="readonly-value">
              {{ (HYPERLIQUID_TARGET_TOTAL_DEFAULT_TENTHS_BPS / 10).toFixed(1) }} bps =
              {{ (HYPERLIQUID_TARGET_TOTAL_DEFAULT_TENTHS_BPS / 1000).toFixed(3) }}%
            </div>
          </div>
          <p class="col-span-2 text-[11px] text-[var(--color-text-dim)]">
            Exchange fee + Trad builder fee equals the target total. Trad calculates the builder fee
            from the account's live exchange tier at order submission. The account wallet must
            approve the configured Trad builder before trading.
          </p>
        </template>
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
        <div v-if="isHyperliquid" class="col-span-2 permission-note">
          <div class="permission-note-title">Required Hyperliquid setup</div>
          <div class="permission-note-grid">
            <span>User wallet address</span>
            <span>Dedicated agent wallet</span>
            <span>USDC perpetual trading</span>
            <span>Builder approval via wallet signature</span>
          </div>
        </div>
        <div
          v-if="requiresValidation"
          class="col-span-2 validation-panel"
          :class="{
            'validation-panel-valid': validationResult?.valid,
            'validation-panel-invalid': hasValidationFailure || validationError,
          }"
        >
          <div class="validation-header">
            <div>
              <div class="validation-title">{{ validationTitle }}</div>
              <div class="validation-copy">
                {{ validationCopy }}
              </div>
            </div>
            <button
              type="button"
              class="btn btn-secondary"
              :disabled="isValidating || !apiKey.trim() || (requiresSecret && !secretKey.trim())"
              @click="validatePermissions"
            >
              <span v-if="isValidating">Checking...</span>
              <span v-else>Check permissions</span>
            </button>
          </div>
          <div v-if="validationResult?.valid" class="validation-success">
            {{ validationSuccess }}
          </div>
          <div v-else-if="permissionError" class="validation-error">
            {{ permissionError }}
          </div>
          <div v-if="validationError" class="validation-error">
            {{ validationError }}
          </div>
          <div v-if="validationResult" class="validation-details">
            <div v-if="validationResult.missing_requirements.length">
              <div class="validation-section-title">Missing</div>
              <ul>
                <li v-for="item in validationResult.missing_requirements" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>
            <div v-if="validationResult.warnings.length">
              <div class="validation-section-title">
                {{ isHyperliquid ? 'Next setup step' : 'Change on Bybit' }}
              </div>
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
              {{ isHyperliquid ? 'Hyperliquid' : 'Bybit' }}: {{ validationResult.exchange_message }}
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

.input-action-row {
  display: flex;
  align-items: stretch;
  gap: 0.35rem;
}

.input-action-row .input {
  min-width: 0;
  flex: 1 1 auto;
}

.compact-action {
  flex: 0 0 auto;
  padding-inline: 0.55rem;
  white-space: nowrap;
}

.field-hint,
.field-error {
  font-size: 11px;
  line-height: 1.35;
}

.field-hint {
  color: var(--color-text-dim);
}

.field-error {
  color: var(--color-danger);
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
