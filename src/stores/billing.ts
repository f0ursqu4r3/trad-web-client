import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiGet, apiPost } from '@/lib/apiClient'
import { createLogger } from '@/lib/utils'

const logger = createLogger('billing')

export interface PlanDetails {
  price_id: string
  product_name: string
  product_description?: string
  price_nickname?: string
  currency: string
  unit_amount?: number
  billing_interval?: string
  billing_interval_count?: number
  features: string[] | Record<string, unknown>
}

export interface BillingInfo {
  plan: string
  status: string
  current_period_end?: string
  trial_end?: string
  cancel_at?: string
  canceled_at?: string
  plan_details?: PlanDetails
}

export interface PricingPlan {
  price_id: string
  product_id?: string | null
  name: string
  description?: string | null
  currency?: string | null
  unit_amount?: number | null
  interval?: 'month' | 'year' | string | null
  interval_count?: number | null
  features?: string[]
  highlighted?: boolean
}

export const useBillingStore = defineStore('billing', () => {
  const { isAuthenticated } = useAuth0()

  const billingInfo = ref<BillingInfo | null>(null)
  const plans = ref<PricingPlan[]>([])
  const checkoutLoading = ref(false)

  async function fetchBillingInfo() {
    if (!isAuthenticated.value) return
    try {
      // Note: apiClient already prefixes with base URL (default '/api')
      const data = await apiGet<BillingInfo>('/billing', { throwOnHTTPError: false })
      billingInfo.value = data ?? null
    } catch (err) {
      // Non-fatal: leave as null and log to logger
      logger.warn('Failed to fetch billing info', err)
      billingInfo.value = null
    }
  }

  async function fetchPlans() {
    try {
      const data = await apiGet<PricingPlan[]>('/billing/plans', { throwOnHTTPError: false })
      if (!data || data.length === 0) {
        plans.value = getDefaultPlans()
        return
      }
      plans.value = normalizePlans(data)
    } catch (err) {
      logger.warn('Failed to fetch plans', err)
      // Fallback to hardcoded plans if API fails
      plans.value = getDefaultPlans()
    }
  }

  async function createCheckoutSession(priceId: string) {
    if (!isAuthenticated.value) return
    checkoutLoading.value = true
    try {
      const { url } = await apiPost<{ url: string }>(
        '/billing/checkout-session',
        { price: priceId },
        { throwOnHTTPError: true },
      )
      if (url) window.location.assign(url)
    } catch (err) {
      logger.error('Failed to create checkout session', err)
    } finally {
      checkoutLoading.value = false
    }
  }

  async function openCustomerPortal() {
    if (!isAuthenticated.value) return
    try {
      // Backend should create a Stripe Billing Portal session and return { url }
      const { url } = await apiPost<{ url: string }>('/billing/portal-session', undefined, {
        throwOnHTTPError: true,
      })
      if (url) window.location.assign(url)
    } catch (err) {
      logger.error('Failed to open billing portal', err)
    }
  }

  watch(
    () => isAuthenticated.value,
    (authenticated) => {
      if (authenticated) fetchBillingInfo()
      else billingInfo.value = null
    },
    { immediate: true },
  )

  return {
    // state
    billingInfo,
    plans,
    checkoutLoading,
    // actions
    fetchBillingInfo,
    fetchPlans,
    createCheckoutSession,
    openCustomerPortal,
  }
})

// Default/fallback plans - customize these to match your Stripe products
function getDefaultPlans(): PricingPlan[] {
  return [
    {
      price_id: import.meta.env.VITE_STRIPE_PRICE_STARTER || 'price_starter',
      name: 'Starter',
      description: 'Perfect for individual traders getting started',
      currency: 'USD',
      unit_amount: 2900,
      interval: 'month',
      interval_count: 1,
      features: [
        '1 trading account',
        'Basic order types',
        'Real-time market data',
        'Email support',
      ],
    },
    {
      price_id: import.meta.env.VITE_STRIPE_PRICE_PRO || 'price_pro',
      name: 'Pro',
      description: 'For serious traders who need more power',
      currency: 'USD',
      unit_amount: 7900,
      interval: 'month',
      interval_count: 1,
      features: [
        '5 trading accounts',
        'Advanced order types',
        'Real-time market data',
        'Priority support',
        'Custom alerts',
        'API access',
      ],
      highlighted: true,
    },
    {
      price_id: import.meta.env.VITE_STRIPE_PRICE_ENTERPRISE || 'price_enterprise',
      name: 'Enterprise',
      description: 'Full power for professional trading operations',
      currency: 'USD',
      unit_amount: 19900,
      interval: 'month',
      interval_count: 1,
      features: [
        'Unlimited trading accounts',
        'All order types',
        'Real-time market data',
        'Dedicated support',
        'Custom alerts & webhooks',
        'Full API access',
        'Custom integrations',
      ],
    },
  ]
}

function normalizePlans(remotePlans: PricingPlan[]): PricingPlan[] {
  const fallbackPlans = getDefaultPlans()
  const fallbackById = new Map(fallbackPlans.map((plan) => [plan.price_id, plan]))
  const fallbackByName = new Map(
    fallbackPlans.map((plan) => [plan.name.toLowerCase(), plan]),
  )

  return remotePlans.map((plan) => {
    const fallback =
      fallbackById.get(plan.price_id) || fallbackByName.get(plan.name?.toLowerCase() || '')
    const features = normalizeFeatures(plan.features, fallback?.features)
    return {
      price_id: plan.price_id,
      product_id: plan.product_id ?? fallback?.product_id ?? null,
      name: plan.name || fallback?.name || 'Plan',
      description: plan.description ?? fallback?.description ?? null,
      currency: plan.currency ?? fallback?.currency ?? 'USD',
      unit_amount: plan.unit_amount ?? fallback?.unit_amount ?? null,
      interval: plan.interval ?? fallback?.interval ?? 'month',
      interval_count: plan.interval_count ?? fallback?.interval_count ?? 1,
      features,
      highlighted: plan.highlighted ?? fallback?.highlighted ?? false,
    }
  })
}

function normalizeFeatures(
  raw: PricingPlan['features'],
  fallback: PricingPlan['features'],
): string[] | undefined {
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string')
  if (Array.isArray(fallback)) return fallback
  return undefined
}
