<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="subscriptions-wrap">
    <div class="terminal-card shadow-term subscriptions-card">
      <!-- Header -->
      <div class="panel-header-row">
        <div class="flex items-center gap-2">
          <img src="/favicon.png" alt="TRAD" class="h-5 w-5 rounded-sm" />
          <span class="tracking-wide">TRAD Terminal</span>
        </div>
        <button
          v-if="authIsAuthenticated"
          type="button"
          class="btn-secondary btn-sm cursor-pointer"
          @click="billing.openCustomerPortal()"
        >
          Manage billing
        </button>
      </div>

      <!-- Body -->
      <div class="p-4 sm:p-6">
        <h1 class="text-xl mb-1">Choose a plan</h1>
        <p class="muted">Select the subscription that best fits your trading needs.</p>

        <div class="section-divider" />

        <p v-if="showEntitlementNotice" class="notice-warn mb-4">
          Subscription required to access the trading terminal. Choose a plan or manage billing to
          continue.
        </p>

        <p v-if="!publishableKey || !pricingTableId" class="notice-err">
          Missing Stripe configuration. Set VITE_STRIPE_PUBLISHABLE_KEY and
          VITE_STRIPE_PRICING_TABLE_ID.
        </p>

        <div v-else class="pricing-table-container">
          <stripe-pricing-table
            :publishable-key="publishableKey"
            :pricing-table-id="pricingTableId"
            :client-reference-id="userId"
            :customer-email="authIsAuthenticated ? userEmail : null"
          />
        </div>

        <div class="section-divider" />

        <p class="notice">
          By subscribing, you agree to our
          <a href="#" class="link-term">Terms of Service</a> and
          <a href="#" class="link-term">Privacy Policy</a>.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { useBillingStore } from '@/stores/billing'
import { useUserStore } from '@/stores/user'

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
const { isAuthenticated, user } = useAuth0()
const billing = useBillingStore()
const userStore = useUserStore()

// Optional: ensure we have fresh billing info if already authenticated
if (isAuthenticated.value) billing.fetchBillingInfo()

// Expose a boolean for template (Auth0 exposes a Ref<boolean>)
const authIsAuthenticated = computed(() => isAuthenticated.value)
const showEntitlementNotice = computed(() => Boolean(route.query.redirect))
const userId = computed(() => userStore.userId)
const userEmail = computed(() => user?.value?.email || '')
</script>

<style scoped>
.subscriptions-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background:
    radial-gradient(
      1200px 600px at 10% -10%,
      color-mix(in srgb, var(--accent-color) 12%, transparent),
      transparent
    ),
    radial-gradient(
      1000px 500px at 110% 10%,
      color-mix(in srgb, var(--accent-color) 10%, transparent),
      transparent
    ),
    var(--color-bg);
}

.subscriptions-card {
  width: 100%;
  max-width: 720px;
}

.pricing-table-container {
  border-radius: 0.375rem;
  overflow: hidden;
}

/* Style Stripe pricing table to blend with theme */
.pricing-table-container :deep(stripe-pricing-table) {
  --stripe-font-family: inherit;
}
</style>
