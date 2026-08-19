<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAdminStore, type PriceBinding } from '@/stores/admin'
import type { CommercialCapability, CommercialPlan } from '@/stores/billing'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

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
  key: '', version: 1, display_name: '', state: 'draft', max_accounts: 1,
  builder_target_total_tenths_bps: 52, capabilities: ['terminal_access'],
})
const changeReason = ref('')
const binding = reactive<PriceBinding>({
  stripe_account_id: 'acct_1SNUVXDsCPYFjNeR', livemode: false, stripe_price_id: '',
  plan_key: '', plan_version: 1, active: true,
})
const latestPlans = computed(() => {
  const seen = new Set<string>()
  return admin.commercialPlans.filter((plan) => !seen.has(plan.key) && seen.add(plan.key))
})
async function createPlan() {
  creating.value = true
  try { await admin.createCommercialPlan({ ...draft, max_accounts: unlimitedAccounts.value ? null : draft.max_accounts }, changeReason.value) }
  finally { creating.value = false }
}
async function saveBinding() { await admin.putPriceBinding({ ...binding }) }
onMounted(() => Promise.all([admin.fetchCommercialPlans(), admin.fetchPriceBindings()]))
</script>

<template>
  <ControlPageHeader eyebrow="Administration" title="Plans & billing" description="Versioned Trad capabilities and explicit Stripe price bindings." />
  <ControlSection title="Commercial plans" :description="`${admin.commercialPlans.length} versions`">
    <div class="overflow-x-auto">
      <table class="table-tiny table-compact min-w-[760px]">
        <thead><tr><th>Plan</th><th>Version</th><th>State</th><th>Accounts</th><th>Target</th><th>Capabilities</th></tr></thead>
        <tbody><tr v-for="plan in admin.commercialPlans" :key="`${plan.key}:${plan.version}`">
          <td><strong>{{ plan.display_name }}</strong><div class="dim">{{ plan.key }}</div></td>
          <td>v{{ plan.version }}</td><td><span class="pill pill-info">{{ plan.state }}</span></td>
          <td>{{ plan.max_accounts ?? 'unlimited' }}</td><td>{{ (plan.builder_target_total_tenths_bps / 10).toFixed(1) }} bps</td>
          <td><span v-for="cap in plan.capabilities" :key="cap" class="pill mr-1">{{ cap.replace(/_/g, ' ') }}</span></td>
        </tr></tbody>
      </table>
    </div>
  </ControlSection>
  <ControlSection title="Create immutable plan version">
    <div class="control-form-grid">
      <label class="field"><span>Stable key</span><input v-model.trim="draft.key" class="input" /></label>
      <label class="field"><span>Display name</span><input v-model.trim="draft.display_name" class="input" /></label>
      <label class="field"><span>Version</span><input v-model.number="draft.version" type="number" min="1" class="input" /></label>
      <label class="field"><span>State</span><select v-model="draft.state" class="input"><option>draft</option><option>active</option><option>retired</option></select></label>
      <label class="field"><span>Account limit</span><input v-model.number="draft.max_accounts" type="number" min="1" class="input" :disabled="unlimitedAccounts" /><span><input v-model="unlimitedAccounts" type="checkbox" /> Unlimited</span></label>
      <label class="field"><span>Builder target (tenths-bps)</span><input v-model.number="draft.builder_target_total_tenths_bps" type="number" min="0" max="52" class="input" /></label>
    </div>
    <div class="flex flex-wrap gap-3 py-3"><label v-for="cap in capabilityOptions" :key="cap" class="flex items-center gap-2 text-xs"><input v-model="draft.capabilities" type="checkbox" :value="cap" />{{ cap.replace(/_/g, ' ') }}</label></div>
    <label class="field max-w-3xl"><span>Change reason</span><input v-model.trim="changeReason" class="input" /></label>
    <div class="control-actions"><button class="btn btn-primary" :disabled="creating || !draft.key || !draft.display_name || !changeReason" @click="createPlan">Create version</button></div>
  </ControlSection>
  <ControlSection title="Stripe price bindings" description="Sandbox and live identities remain distinct.">
    <div class="control-form-grid">
      <label class="field"><span>Stripe account</span><input v-model.trim="binding.stripe_account_id" class="input" /></label>
      <label class="field"><span>Price ID</span><input v-model.trim="binding.stripe_price_id" class="input" /></label>
      <label class="field"><span>Plan</span><select v-model="binding.plan_key" class="input"><option value="">Select</option><option v-for="plan in latestPlans" :key="plan.key" :value="plan.key">{{ plan.display_name }}</option></select></label>
      <label class="field"><span>Version</span><input v-model.number="binding.plan_version" type="number" min="1" class="input" /></label>
      <label class="field"><span>Mode</span><select v-model="binding.livemode" class="input"><option :value="false">sandbox</option><option :value="true">live</option></select></label>
    </div>
    <div class="control-actions"><button class="btn btn-primary" :disabled="!binding.stripe_price_id || !binding.plan_key" @click="saveBinding">Bind price</button></div>
    <div class="overflow-x-auto mt-4"><table class="table-tiny table-compact min-w-[680px]"><thead><tr><th>Mode</th><th>Price</th><th>Plan version</th><th>Account</th></tr></thead><tbody><tr v-for="item in admin.priceBindings" :key="item.stripe_price_id"><td>{{ item.livemode ? 'live' : 'sandbox' }}</td><td>{{ item.stripe_price_id }}</td><td>{{ item.plan_key }} v{{ item.plan_version }}</td><td>{{ item.stripe_account_id }}</td></tr></tbody></table></div>
  </ControlSection>
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>
