import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { watch } from 'vue'
import { useAuth0 } from '@auth0/auth0-vue'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/terminal' },
  { path: '/login', component: () => import('@/views/Login.vue'), meta: { layout: 'blank' } },
  {
    path: '/subscriptions',
    component: () => import('@/views/Subscriptions.vue'),
    meta: { layout: 'blank' },
  },
  {
    path: '/terminal',
    component: () => import('@/views/TradingTerminal.vue'),
    meta: { requiresAuth: true, requiresEntitlement: true, layout: 'authenticated' },
  },
  {
    path: '/style-guide',
    component: () => import('@/views/StyleGuide.vue'),
    meta: { layout: 'blank' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/terminal' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const { isAuthenticated, isLoading } = useAuth0()

  // Wait for Auth0 SDK to finish loading on initial refresh
  if (isLoading.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => isLoading.value,
        (loading: boolean) => {
          if (!loading) {
            stop()
            resolve()
          }
        },
        { immediate: true },
      )
    })
  }

  const authed = isAuthenticated.value

  if (to.meta.requiresAuth && !authed) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresEntitlement && authed) {
    const userStore = useUserStore()
    if (!userStore.lastFetchedAt && !userStore.loading) {
      await userStore.fetchMe()
    }
    if (userStore.entitled === false) {
      return { path: '/subscriptions', query: { redirect: to.fullPath } }
    }
  }

  if (to.path === '/login' && authed) {
    return { path: '/terminal' }
  }
  return true
})

export default router
