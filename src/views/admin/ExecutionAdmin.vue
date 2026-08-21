<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const admin = useAdminStore()
const target = ref(5.2)
const mainnetBuilder = ref('')
const testnetBuilder = ref('')
const saved = ref(false)
const valid = computed(
  () => Number.isFinite(target.value) && target.value >= 0 && target.value <= 10,
)
async function save() {
  if (!valid.value) return
  saved.value = false
  await admin.updatePolicy({
    hyperliquid_target_total_tenths_bps: Math.round(target.value * 10),
    hyperliquid_mainnet_builder_address: mainnetBuilder.value || null,
    hyperliquid_testnet_builder_address: testnetBuilder.value || null,
    hyperliquid_approval_ceiling_tenths_bps: 100,
    version: admin.policy?.version || 1,
  })
  saved.value = !admin.error
}
onMounted(async () => {
  await admin.fetchPolicy()
  if (admin.policy) {
    target.value = admin.policy.hyperliquid_target_total_tenths_bps / 10
    mainnetBuilder.value = admin.policy.hyperliquid_mainnet_builder_address || ''
    testnetBuilder.value = admin.policy.hyperliquid_testnet_builder_address || ''
  }
})
</script>
<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Execution policy"
    description="Trad-wide default fee policy. User and trading-account overrides take precedence."
  />
  <ControlSection title="Hyperliquid builder policy"
    ><div class="control-form-grid max-w-3xl">
      <label class="field"
        ><span>Target total per side (bps)</span
        ><input
          v-model.number="target"
          class="input"
          type="number"
          min="0"
          max="10"
          step="0.1"
        /><span
          >Exchange fee + Trad builder fee. Existing Hyperliquid accounts are revised
          together.</span
        ></label
      >
      <label class="field"
        ><span>Mainnet builder address</span
        ><input v-model.trim="mainnetBuilder" class="input" placeholder="0x…" /><span
          >Rotating this invalidates prior account approval checks.</span
        ></label
      >
      <label class="field"
        ><span>Testnet builder address</span
        ><input v-model.trim="testnetBuilder" class="input" placeholder="Optional 0x…"
      /></label>
      <div class="control-detail-grid">
        <div><span>Wallet approval ceiling</span><strong>10.0 bps / 0.100%</strong></div>
        <div><span>Configurable range</span><strong>0.0–10.0 bps</strong></div>
      </div>
    </div>
    <div class="control-actions">
      <button class="btn btn-primary" :disabled="!valid || admin.loading" @click="save">
        Apply policy</button
      ><span v-if="saved" class="notice-ok m-0">Applied and audited.</span>
    </div>
    <p class="control-notice">
      5.2 bps is the initial default, not a cap. Policy changes are versioned. Account
      configurations adopt the version on the next authorization or billing reconciliation; an
      address rotation requires fresh wallet approval.
    </p></ControlSection
  >
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>
