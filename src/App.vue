<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter, RouterView } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { useUserStore } from '@/stores/user'

import AuthenticatedLayout from '@/layouts/Authenticated.vue'

const { isAuthenticated } = useAuth0()
const userStore = useUserStore()
const router = useRouter()

// Simple Nuxt-like layout selection using route meta
const route = useRoute()
const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || 'default'
  switch (name) {
    case 'authenticated':
      return AuthenticatedLayout
    case 'blank':
    case 'default':
    default:
      return null
  }
})

// Only force navigation to login if the CURRENT route actually requires auth.
// The global router.beforeEach already blocks navigation into protected routes.
// This prevents public routes like /style-guide from being hijacked during the
// initial Auth0 loading phase (when isAuthenticated is still false).
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
</style>
