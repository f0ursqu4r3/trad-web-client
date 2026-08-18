<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useBillingStore } from '@/stores/billing'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const billing = useBillingStore()
onMounted(() => billing.fetchBillingInfo())
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Billing"
    description="Subscription access and Stripe-managed payment details."
  />
  <ControlSection title="Current access">
    <div v-if="billing.billingInfo" class="control-detail-grid">
      <div>
        <span>Plan</span
        ><strong>{{
          billing.billingInfo.plan_details?.product_name || billing.billingInfo.plan
        }}</strong>
      </div>
      <div>
        <span>Status</span
        ><strong
          ><span
            class="pill"
            :class="billing.billingInfo.status === 'active' ? 'pill-ok' : 'pill-warn'"
            >{{ billing.billingInfo.status }}</span
          ></strong
        >
      </div>
      <div>
        <span>Period ends</span
        ><strong>{{
          billing.billingInfo.current_period_end
            ? new Date(billing.billingInfo.current_period_end).toLocaleDateString()
            : '—'
        }}</strong>
      </div>
    </div>
    <p v-else class="dim">No subscription record is attached to this user.</p>
    <div class="mt-4 flex gap-2">
      <button
        v-if="billing.billingInfo"
        class="btn btn-primary"
        @click="billing.openCustomerPortal()"
      >
        Manage billing</button
      ><RouterLink to="/subscriptions" class="btn btn-secondary">View plans</RouterLink>
    </div>
  </ControlSection>
  <ControlSection title="What Stripe controls"
    ><p class="m-0 max-w-3xl text-[12px] leading-relaxed dim">
      Payment methods, invoices, cancellation, and renewal are completed in Stripe’s customer
      portal. Trad stores only the subscription state needed to determine access.
    </p></ControlSection
  >
</template>
