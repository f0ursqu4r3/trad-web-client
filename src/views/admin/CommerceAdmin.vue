<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminStore, type PriceBinding } from '@/stores/admin'
import type { CommercialCapability, CommercialPlan } from '@/stores/billing'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'
import FormField from '@/components/forms/FormField.vue'
import { integerError, requiredText } from '@/lib/formValidation'

const admin = useAdminStore()
const creating = ref(false)
const unlimitedAccounts = ref(false)
const capabilityOptions: CommercialCapability[] = [
  'terminal_access',
  'advanced_order_types',
  'custom_alerts',
  'webhook_access',
  'api_access',
  'custom_integrations',
]
const draft = reactive<CommercialPlan>({
  key: '',
  version: 1,
  display_name: '',
  state: 'draft',
  max_accounts: 1,
  builder_target_total_tenths_bps: 52,
  capabilities: ['terminal_access'],
})
const changeReason = ref('')
const binding = reactive<PriceBinding>({
  stripe_account_id: 'acct_1SNUVXDsCPYFjNeR',
  livemode: false,
  stripe_price_id: '',
  plan_key: '',
  plan_version: 1,
  active: true,
})
const latestPlans = computed(() => {
  const seen = new Set<string>()
  return admin.commercialPlans.filter((plan) => !seen.has(plan.key) && seen.add(plan.key))
})
const draftKeyError = computed(() => requiredText(draft.key, 'Stable key'))
const displayNameError = computed(() => requiredText(draft.display_name, 'Display name'))
const versionError = computed(() => integerError(String(draft.version), 'Version', 1))
const accountLimitError = computed(() =>
  unlimitedAccounts.value ? null : integerError(String(draft.max_accounts), 'Account limit', 1),
)
const builderTargetError = computed(() =>
  integerError(String(draft.builder_target_total_tenths_bps), 'Builder target', 0, 52),
)
const changeReasonError = computed(() => requiredText(changeReason.value, 'Change reason'))
const priceIdError = computed(() => requiredText(binding.stripe_price_id, 'Stripe price ID'))
const bindingPlanError = computed(() => requiredText(binding.plan_key, 'Plan'))
async function createPlan() {
  creating.value = true
  try {
    await admin.createCommercialPlan(
      { ...draft, max_accounts: unlimitedAccounts.value ? null : draft.max_accounts },
      changeReason.value,
    )
  } finally {
    creating.value = false
  }
}
async function saveBinding() {
  await admin.putPriceBinding({ ...binding })
}
onMounted(() => Promise.all([admin.fetchCommercialPlans(), admin.fetchPriceBindings()]))
</script>

<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Plans & billing"
    description="Versioned Trad capabilities and explicit Stripe price bindings."
  />
  <ControlSection
    title="Commercial plans"
    :description="`${admin.commercialPlans.length} versions`"
  >
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[760px]">
        <thead>
          <tr>
            <th>Plan</th>
            <th>Version</th>
            <th>State</th>
            <th>Accounts</th>
            <th>Target</th>
            <th>Capabilities</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="plan in admin.commercialPlans" :key="`${plan.key}:${plan.version}`">
            <td>
              <strong>{{ plan.display_name }}</strong>
              <div class="dim">{{ plan.key }}</div>
            </td>
            <td>v{{ plan.version }}</td>
            <td>
              <span class="pill pill-info">{{ plan.state }}</span>
            </td>
            <td>{{ plan.max_accounts ?? 'unlimited' }}</td>
            <td>{{ (plan.builder_target_total_tenths_bps / 10).toFixed(1) }} bps</td>
            <td>
              <span v-for="cap in plan.capabilities" :key="cap" class="pill mr-1">{{
                cap.replace(/_/g, ' ')
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>
  <ControlSection title="Create immutable plan version">
    <div class="control-form-grid">
      <FormField
        label="Stable key"
        help="Permanent machine identifier shared by every version of this plan."
        :error="draftKeyError"
        required
        ><input v-model.trim="draft.key" class="input"
      /></FormField>
      <FormField
        label="Display name"
        help="Customer-facing name shown in billing and access views."
        :error="displayNameError"
        required
        ><input v-model.trim="draft.display_name" class="input"
      /></FormField>
      <FormField
        label="Version"
        help="Immutable version number for this plan definition."
        :error="versionError"
        required
        ><input v-model.number="draft.version" type="number" min="1" class="input"
      /></FormField>
      <FormField
        label="State"
        help="Draft plans cannot be assigned; active plans can; retired plans remain historical."
        required
        ><select v-model="draft.state" class="input">
          <option>draft</option>
          <option>active</option>
          <option>retired</option>
        </select></FormField
      >
      <FormField
        label="Account limit"
        help="Maximum trading accounts a user on this plan may configure."
        :error="accountLimitError"
        required
        ><input
          v-model.number="draft.max_accounts"
          type="number"
          min="1"
          class="input"
          :disabled="unlimitedAccounts"
        /><span class="inline-check"
          ><input v-model="unlimitedAccounts" type="checkbox" /> Unlimited</span
        ></FormField
      >
      <FormField
        label="Builder target (tenths-bps)"
        help="Target exchange fee plus Trad builder fee per side. 52 means 5.2 bps."
        :error="builderTargetError"
        required
        ><input
          v-model.number="draft.builder_target_total_tenths_bps"
          type="number"
          min="0"
          max="52"
          class="input"
      /></FormField>
    </div>
    <div class="flex flex-wrap gap-3 py-3">
      <label v-for="cap in capabilityOptions" :key="cap" class="flex items-center gap-2 text-xs"
        ><input v-model="draft.capabilities" type="checkbox" :value="cap" />{{
          cap.replace(/_/g, ' ')
        }}</label
      >
    </div>
    <FormField
      class="max-w-3xl"
      label="Change reason"
      help="Audited explanation for creating this immutable plan version."
      :error="changeReasonError"
      required
      ><input v-model.trim="changeReason" class="input"
    /></FormField>
    <div class="control-actions">
      <button
        class="btn btn-primary"
        :disabled="
          creating ||
          Boolean(
            draftKeyError ||
              displayNameError ||
              versionError ||
              accountLimitError ||
              builderTargetError ||
              changeReasonError,
          )
        "
        @click="createPlan"
      >
        Create version
      </button>
    </div>
  </ControlSection>
  <ControlSection
    title="Stripe price bindings"
    description="Sandbox and live identities remain distinct."
  >
    <div class="control-form-grid">
      <FormField
        label="Stripe account"
        help="Stripe connected-account identity that owns this price."
        required
        ><input v-model.trim="binding.stripe_account_id" class="input"
      /></FormField>
      <FormField
        label="Price ID"
        help="Immutable Stripe price identifier to map to a Trad plan."
        :error="priceIdError"
        required
        ><input v-model.trim="binding.stripe_price_id" class="input"
      /></FormField>
      <FormField
        label="Plan"
        help="Trad plan granted when this Stripe price is active."
        :error="bindingPlanError"
        required
        ><select v-model="binding.plan_key" class="input">
          <option value="">Select</option>
          <option v-for="plan in latestPlans" :key="plan.key" :value="plan.key">
            {{ plan.display_name }}
          </option>
        </select></FormField
      >
      <FormField
        label="Version"
        help="Exact immutable Trad plan version granted by this price."
        required
        ><input v-model.number="binding.plan_version" type="number" min="1" class="input"
      /></FormField>
      <FormField
        label="Mode"
        help="Stripe sandbox and live price namespaces are intentionally separate."
        required
        ><select v-model="binding.livemode" class="input">
          <option :value="false">sandbox</option>
          <option :value="true">live</option>
        </select></FormField
      >
    </div>
    <div class="control-actions">
      <button
        class="btn btn-primary"
        :disabled="Boolean(priceIdError || bindingPlanError)"
        @click="saveBinding"
      >
        Bind price
      </button>
    </div>
    <div class="overflow-x-auto mt-4">
      <table class="table-tiny table-compact min-w-[680px]">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Price</th>
            <th>Plan version</th>
            <th>Account</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in admin.priceBindings" :key="item.stripe_price_id">
            <td>{{ item.livemode ? 'live' : 'sandbox' }}</td>
            <td>{{ item.stripe_price_id }}</td>
            <td>{{ item.plan_key }} v{{ item.plan_version }}</td>
            <td>{{ item.stripe_account_id }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </ControlSection>
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>
