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
    path: '/settings',
    redirect: '/settings/profile',
    meta: { requiresAuth: true, layout: 'control' },
  },
  {
    path: '/settings/accounts/:accountId/:accountSection(overview|setup|defaults|safety|authorization|danger)?',
    component: () => import('@/views/settings/AccountSettingsView.vue'),
    meta: { requiresAuth: true, layout: 'control', controlArea: 'settings' },
  },
  {
    path: '/settings/:section(profile|accounts|authorization|preferences|billing)',
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: { requiresAuth: true, layout: 'control', controlArea: 'settings' },
  },
  {
    path: '/admin',
    redirect: '/admin/operations',
    meta: { requiresAuth: true, requiresAdmin: true, layout: 'control' },
  },
  {
    path: '/admin/:section(operations|users|accounts|execution|audit)',
    component: () => import('@/views/admin/AdminView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      layout: 'control',
      controlArea: 'admin',
    },
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
        {
          path: '/e2e/engine-projection',
          component: () => import('@/views/e2e/EngineProjectionFixture.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/engine-projection-load',
          component: () => import('@/views/e2e/EngineProjectionLoad.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/engine-commands',
          component: () => import('@/views/e2e/EngineCommandFixture.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/bybit-live-smoke',
          component: () => import('@/views/e2e/BybitLiveSmoke.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/bybit-live-account-panel',
          component: () => import('@/views/e2e/BybitLiveAccountPanel.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/bybit-live-watch-only',
          component: () => import('@/views/e2e/BybitLiveWatchOnly.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/bybit-live-bulk-te',
          component: () => import('@/views/e2e/BybitLiveBulkTe.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/bybit-live-native-tpsl-fill',
          component: () => import('@/views/e2e/BybitLiveNativeTpslFill.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/hyperliquid-te-smoke',
          component: () => import('@/views/e2e/HyperliquidTeSmoke.vue'),
          meta: { layout: 'blank' },
        },
        {
          path: '/e2e/sim-load-smoke',
          component: () => import('@/views/e2e/SimLoadSmoke.vue'),
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

  if (to.meta.requiresAdmin && authed) {
    const userStore = useUserStore()
    if (!userStore.lastFetchedAt && !userStore.loading) await userStore.fetchMe()
    if (!userStore.isAdmin) return { path: '/settings/profile' }
  }

  if (to.path === '/login' && authed) {
    return { path: '/terminal' }
  }
  return true
})

export default router
