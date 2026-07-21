<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseCommandModal from '@/components/terminal/modals/commands/BaseCommandModal.vue'
import { buildAccountFormPayload } from '@/lib/accountFormPayload'
import { enumKeyName } from '@/lib/utils'
import { getWebSocketToken } from '@/lib/auth'
import { NetworkType, ExchangeType } from '@/lib/ws/protocol'
import { useAccountsStore, type AccountKeyValidationResponse, type AccountRecord } from '@/stores/accounts'
import { useWsStore } from '@/stores/ws'

const props = withDefaults(defineProps<{ open: boolean }>(), { open: false })
const emit = defineEmits<{ (e: 'close'): void }>()

const accounts = useAccountsStore()
const ws = useWsStore()

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
const hyperliquidVaultAddress = ref('')
const hyperliquidBuilderFeeBps = ref('1')
const hyperliquidDefaultLeverage = ref('1')
const formError = ref<string | null>(null)
const isSubmitting = ref(false)
const isRefreshingAfterCreate = ref(false)
const isValidating = ref(false)
const validationResult = ref<AccountKeyValidationResponse | null>(null)
const validationError = ref<string | null>(null)
const isBybit = computed(() => exchange.value === ExchangeType.Bybit)
const isHyperliquid = computed(() => exchange.value === ExchangeType.Hyperliquid)
const requiresValidation = computed(() => isBybit.value || isHyperliquid.value)
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
    ? 'Validate the wallet address and derived agent wallet before saving. Builder approval is handled separately with a wallet signature.'
    : 'Validate this key before saving. If permissions are changed on Bybit, run the check again.',
)
const validationSuccess = computed(() =>
  isHyperliquid.value
    ? 'Wallet and agent key format are valid for Hyperliquid account setup.'
    : 'Key permissions are valid for Bybit USDT perpetual trading.',
)
const builderFeeTenthsBps = computed(() => {
  const parsed = Number(hyperliquidBuilderFeeBps.value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 10)
})
const defaultLeverage = computed(() => {
  const parsed = Number(hyperliquidDefaultLeverage.value)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
})
const isHyperliquidMetadataValid = computed(() => {
  if (!isHyperliquid.value) return true
  return builderFeeTenthsBps.value !== null && builderFeeTenthsBps.value <= 100 && defaultLeverage.value !== null
})

const isSubmitDisabled = computed(() => {
  return (
    !network.value ||
    !name.value.trim() ||
    !apiKey.value.trim() ||
    !secretKey.value.trim() ||
    isValidating.value ||
    !hasKeyValidationPass.value ||
    !isHyperliquidMetadataValid.value
  )
})

const hasValidationFailure = computed(() => {
  return requiresValidation.value && validationResult.value !== null && !validationResult.value.valid
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
  hyperliquidVaultAddress.value = ''
  hyperliquidBuilderFeeBps.value = '1'
  hyperliquidDefaultLeverage.value = '1'
  formError.value = null
  isSubmitting.value = false
  isRefreshingAfterCreate.value = false
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
  if (requiresValidation.value && validationResult.value?.valid !== true) {
    formError.value = isHyperliquid.value
      ? 'Check Hyperliquid wallet and agent key before creating this account.'
      : 'Check Bybit key permissions before creating this account.'
    return
  }
  isSubmitting.value = true
  isRefreshingAfterCreate.value = false
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
      }),
    )
    if (isBybit.value && createdAccount) {
      await refreshCreatedBybitAccount(createdAccount)
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
    builder_fee_tenths_bps: builderFeeTenthsBps.value,
    max_builder_fee_tenths_bps: 100,
    builder_approved: false,
    agent_approved: false,
    default_leverage: defaultLeverage.value,
  }
}

async function refreshCreatedBybitAccount(account: AccountRecord) {
  if (ws.status !== 'ready') return
  const token = await getWebSocketToken()
  if (!token) return
  isRefreshingAfterCreate.value = true
  try {
    await ws.sendRefreshAccountKeys(account.id, account.label, token)
  } catch {
    // Account creation succeeded. Leave manual refresh available if the metadata refresh misses.
  } finally {
    isRefreshingAfterCreate.value = false
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
        <div v-else-if="isHyperliquid" class="field">
          <span>Product</span>
          <div class="readonly-value">{{ productLabel }}</div>
        </div>
        <label class="field">
          <span>{{ keyLabel }}</span>
          <input
            v-model.trim="apiKey"
            class="input"
            :class="keyInputClass"
            :placeholder="keyPlaceholder"
          />
        </label>
        <label class="field">
          <span>{{ secretLabel }}</span>
          <input
            v-model.trim="secretKey"
            class="input"
            :class="keyInputClass"
            :placeholder="secretPlaceholder"
          />
        </label>
        <template v-if="isHyperliquid">
          <label class="field">
            <span>Vault/Subaccount</span>
            <input
              v-model.trim="hyperliquidVaultAddress"
              class="input"
              placeholder="Optional 0x vault address"
            />
          </label>
          <label class="field">
            <span>Default Leverage</span>
            <input
              v-model.trim="hyperliquidDefaultLeverage"
              class="input"
              type="number"
              min="1"
              step="1"
              placeholder="1"
            />
          </label>
          <label class="field">
            <span>Builder Fee</span>
            <input
              v-model.trim="hyperliquidBuilderFeeBps"
              class="input"
              :class="{ 'input-invalid': builderFeeTenthsBps === null || builderFeeTenthsBps > 100 }"
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="1.0"
            />
          </label>
          <div class="field">
            <span>Fee Equivalent</span>
            <div class="readonly-value">
              {{ builderFeeTenthsBps === null ? 'Invalid' : `${(builderFeeTenthsBps / 10).toFixed(1)} bps = ${(builderFeeTenthsBps / 1000).toFixed(3)}%` }}
            </div>
          </div>
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
            <span>Agent private key</span>
            <span>USDC perpetual trading</span>
            <span>Builder approval via wallet signature</span>
          </div>
        </div>
        <div v-if="requiresValidation" class="col-span-2 validation-panel" :class="{
          'validation-panel-valid': validationResult?.valid,
          'validation-panel-invalid': hasValidationFailure || validationError,
        }">
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
              :disabled="isValidating || !apiKey.trim() || !secretKey.trim()"
              @click="validatePermissions"
            >
              <span v-if="isValidating">Checking...</span>
              <span v-else>Check permissions</span>
            </button>
          </div>
          <div v-if="validationResult?.valid" class="validation-success">
            {{ validationSuccess }}
          </div>
          <div v-if="validationError" class="validation-error">
            {{ validationError }}
          </div>
          <div v-if="validationResult" class="validation-details">
            <div v-if="validationResult.missing_requirements.length">
              <div class="validation-section-title">Missing</div>
              <ul>
                <li v-for="item in validationResult.missing_requirements" :key="item">{{ item }}</li>
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
          <span v-if="isRefreshingAfterCreate">Refreshing...</span>
          <span v-else-if="isSubmitting">Creating...</span>
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
