import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '@/lib/auth'
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
  ...(import.meta.env.VITE_E2E === '1'
    ? [
        {
          path: '/e2e/bybit-terminal',
          component: () => import('@/views/e2e/BybitTerminalFixture.vue'),
          meta: { layout: 'blank' },
        },
      ]
    : []),
  { path: '/:pathMatch(.*)*', redirect: '/terminal' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuth()
  await auth.waitUntilReady()

  const authed = auth.isAuthenticated.value

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
