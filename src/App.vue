<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter, RouterView } from 'vue-router'
import { useAuth } from '@/lib/auth'
import { useGatewayStore } from '@/stores/gateway'
import { useUserStore } from '@/stores/user'
import { useAccountsStore } from '@/stores/accounts'

import AuthenticatedLayout from '@/layouts/Authenticated.vue'
import ControlPlaneLayout from '@/layouts/ControlPlane.vue'

const { isAuthenticated } = useAuth()
const gateway = useGatewayStore()
const userStore = useUserStore()
const accountsStore = useAccountsStore()
const router = useRouter()
const frontendFailure = ref<string | null>(null)
let accountRefreshTimer: ReturnType<typeof window.setInterval> | null = null

function describeFailure(value: unknown): string {
  if (value instanceof Error) return value.message
  return typeof value === 'string' ? value : 'An unexpected interface error occurred.'
}

function captureWindowError(event: ErrorEvent): void {
  frontendFailure.value = describeFailure(event.error ?? event.message)
}

function captureRejectedPromise(event: PromiseRejectionEvent): void {
  frontendFailure.value = describeFailure(event.reason)
}

onErrorCaptured((error) => {
  frontendFailure.value = describeFailure(error)
})

// Simple Nuxt-like layout selection using route meta
const route = useRoute()
const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || 'default'
  switch (name) {
    case 'authenticated':
      return AuthenticatedLayout
    case 'control':
      return ControlPlaneLayout
    case 'blank':
    case 'default':
    default:
      return null
  }
})

// Keep the transport alive for the authenticated browser session. Terminal
// navigation changes consumers and subscriptions, not connection ownership.
watch(
  () => [isAuthenticated.value, route.meta.fixture] as const,
  ([authenticated, fixture]) => {
    if (fixture) gateway.disconnect()
    else if (authenticated) gateway.connect()
    else gateway.disconnect()
  },
  { immediate: true },
)

function refreshCrossSessionAccountState(): void {
  if (!isAuthenticated.value || document.visibilityState !== 'visible') return
  void accountsStore.fetchAccounts()
}

onMounted(() => {
  window.addEventListener('focus', refreshCrossSessionAccountState)
  window.addEventListener('error', captureWindowError)
  window.addEventListener('unhandledrejection', captureRejectedPromise)
  document.addEventListener('visibilitychange', refreshCrossSessionAccountState)
  accountRefreshTimer = window.setInterval(refreshCrossSessionAccountState, 30_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshCrossSessionAccountState)
  window.removeEventListener('error', captureWindowError)
  window.removeEventListener('unhandledrejection', captureRejectedPromise)
  document.removeEventListener('visibilitychange', refreshCrossSessionAccountState)
  if (accountRefreshTimer !== null) window.clearInterval(accountRefreshTimer)
})

// Only force navigation to login if the CURRENT route actually requires auth.
// The global router.beforeEach already blocks navigation into protected routes.
// This prevents public routes like /style-guide from being hijacked during the
// initial auth loading phase (when isAuthenticated is still false).
watch(
  () => [isAuthenticated.value, route.fullPath],
  ([isAuth]) => {
    const requiresAuth = route.meta?.requiresAuth
    if (!isAuth && requiresAuth) {
      router.replace({ path: '/login', query: { redirect: route.fullPath } })
    }
  },
  { immediate: true },
)

watch(
  () => [userStore.entitled, isAuthenticated.value, route.fullPath],
  ([entitled, isAuth]) => {
    const requiresEntitlement = route.meta?.requiresEntitlement
    if (!isAuth || !requiresEntitlement) return
    if (entitled === false && route.path !== '/subscriptions') {
      router.replace({ path: '/subscriptions', query: { redirect: route.fullPath } })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="app-root">
    <aside v-if="frontendFailure" class="frontend-failure" role="alert">
      <span>Interface error: {{ frontendFailure }}</span>
      <button type="button" @click="frontendFailure = null">dismiss</button>
    </aside>
    <component v-if="layoutComponent" :is="layoutComponent">
      <RouterView />
    </component>
    <RouterView v-else />
  </div>
</template>

<style scoped>
.app-root {
  height: 100vh;
}
.frontend-failure {
  position: fixed;
  z-index: 10000;
  right: 0.75rem;
  bottom: 0.75rem;
  display: flex;
  max-width: min(42rem, calc(100vw - 1.5rem));
  gap: 1rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--state-error);
  color: var(--state-error);
  background: var(--surface-raised);
}
.frontend-failure button {
  color: inherit;
  text-decoration: underline;
}
</style>
