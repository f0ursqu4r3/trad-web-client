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
        <div class="flex items-center gap-2">
          <RouterLink v-if="authIsAuthenticated" to="/" class="btn-secondary btn-sm">
            ← Back to Terminal
          </RouterLink>
          <button
            v-if="authIsAuthenticated"
            type="button"
            class="btn-secondary btn-sm cursor-pointer"
            @click="billing.openCustomerPortal()"
          >
            ↑ Manage billing
          </button>
        </div>
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

        <p v-if="!authIsAuthenticated" class="notice-info mb-4">
          <a href="/login" class="link-term">Sign in</a> to subscribe to a plan.
        </p>

        <PricingTable
          :plans="billing.plans"
          :current-plan-id="billing.billingInfo?.plan"
          :loading="billing.checkoutLoading"
          @subscribe="handleSubscribe"
        />

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
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { useBillingStore } from '@/stores/billing'
import PricingTable from '@/components/billing/PricingTable.vue'

const route = useRoute()
const { isAuthenticated, loginWithRedirect } = useAuth0()
const billing = useBillingStore()

// Fetch plans on mount
onMounted(() => {
  billing.fetchPlans()
  if (isAuthenticated.value) {
    billing.fetchBillingInfo()
  }
})

// Expose a boolean for template (Auth0 exposes a Ref<boolean>)
const authIsAuthenticated = computed(() => isAuthenticated.value)
const showEntitlementNotice = computed(() => Boolean(route.query.redirect))

async function handleSubscribe(priceId: string) {
  if (!isAuthenticated.value) {
    // Redirect to login, then back here
    await loginWithRedirect({
      appState: { targetUrl: route.fullPath },
      authorizationParams: {
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: import.meta.env.VITE_AUTH0_SCOPE,
      },
    })
    return
  }
  await billing.createCheckoutSession(priceId)
}
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
  max-width: 900px;
}
</style>
