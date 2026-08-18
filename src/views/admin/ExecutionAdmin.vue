<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const admin = useAdminStore()
const target = ref(5.2)
const saved = ref(false)
const valid = computed(
  () => Number.isFinite(target.value) && target.value >= 0 && target.value <= 5.2,
)
async function save() {
  if (!valid.value) return
  saved.value = false
  await admin.updatePolicy({ hyperliquid_target_total_tenths_bps: Math.round(target.value * 10) })
  saved.value = !admin.error
}
onMounted(async () => {
  await admin.fetchPolicy()
  if (admin.policy) target.value = admin.policy.hyperliquid_target_total_tenths_bps / 10
})
</script>
<template>
  <ControlPageHeader
    eyebrow="Administration"
    title="Execution policy"
    description="Platform-owned fee policy. Users approve a ceiling but cannot choose Trad’s actual target."
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
          max="5.2"
          step="0.1"
        /><span
          >Exchange fee + Trad builder fee. Existing Hyperliquid accounts are revised
          together.</span
        ></label
      >
      <div class="control-detail-grid">
        <div><span>Wallet approval ceiling</span><strong>10.0 bps / 0.100%</strong></div>
        <div><span>Business boundary</span><strong>0.0–5.2 bps</strong></div>
      </div>
    </div>
    <div class="mt-4 flex items-center gap-3">
      <button class="btn btn-primary" :disabled="!valid || admin.loading" @click="save">
        Apply policy</button
      ><span v-if="saved" class="notice-ok m-0">Applied and audited.</span>
    </div>
    <p class="notice-warn">
      Changing this value increments every Hyperliquid account configuration revision. Lower
      existing wallet approvals remain valid only when they still cover the target.
    </p></ControlSection
  >
  <p v-if="admin.error" class="notice-err">{{ admin.error }}</p>
</template>
