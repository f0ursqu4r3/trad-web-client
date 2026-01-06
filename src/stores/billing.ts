import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { apiGet, apiPost } from '@/lib/apiClient'

export interface BillingInfo {
  plan: string
  status: string
  current_period_end: string
}

export const useBillingStore = defineStore('billing', () => {
  const { isAuthenticated } = useAuth0()

  const billingInfo = ref<BillingInfo | null>(null)

  async function fetchBillingInfo() {
    if (!isAuthenticated.value) return
    try {
      // Note: apiClient already prefixes with base URL (default '/api')
      const data = await apiGet<BillingInfo>('/billing', { throwOnHTTPError: false })
      billingInfo.value = data ?? null
    } catch (err) {
      // Non-fatal: leave as null and log to console
      console.warn('Failed to fetch billing info', err)
      billingInfo.value = null
    }
  }

  async function openCustomerPortal() {
    if (!isAuthenticated.value) return
    try {
      // Backend should create a Stripe Billing Portal session and return { url }
      const { url } = await apiPost<{ url: string }>('/billing/portal', undefined, {
        throwOnHTTPError: true,
      })
      if (url) window.location.assign(url)
    } catch (err) {
      console.error('Failed to open billing portal', err)
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
    // actions
    fetchBillingInfo,
    openCustomerPortal,
  }
})
