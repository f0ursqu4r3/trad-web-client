<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="mx-auto max-w-5xl p-6 space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Choose a plan</h1>
      <button
        v-if="authIsAuthenticated"
        class="btn btn-secondary btn-sm"
        @click="billing.openCustomerPortal()"
      >
        Manage billing
      </button>
    </div>

    <p v-if="showEntitlementNotice" class="notice-warn">
      Subscription required to access the trading terminal. Choose a plan or manage billing to
      continue.
    </p>

    <p v-if="!publishableKey || !pricingTableId" class="notice-err">
      Missing Stripe configuration. Set VITE_STRIPE_PUBLISHABLE_KEY and
      VITE_STRIPE_PRICING_TABLE_ID.
    </p>

    <stripe-pricing-table
      v-else
      :publishable-key="publishableKey"
      :pricing-table-id="pricingTableId"
    >
    </stripe-pricing-table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { useBillingStore } from '@/stores/billing'

// Load Stripe Pricing Table script
useHead({
  script: [
    {
      src: 'https://js.stripe.com/v3/pricing-table.js',
      async: true,
    },
  ],
})

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
const pricingTableId = import.meta.env.VITE_STRIPE_PRICING_TABLE_ID

const route = useRoute()
const { isAuthenticated } = useAuth0()
const billing = useBillingStore()

// Optional: ensure we have fresh billing info if already authenticated
if (isAuthenticated.value) billing.fetchBillingInfo()

// Expose a boolean for template (Auth0 exposes a Ref<boolean>)
const authIsAuthenticated = computed(() => isAuthenticated.value)
const showEntitlementNotice = computed(() => Boolean(route.query.redirect))
</script>
