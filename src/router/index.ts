import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/terminal' },
  { path: '/login', component: () => import('@/views/Login.vue'), meta: { layout: 'blank' } },
  {
    path: '/terminal',
    component: () => import('@/views/TradingTerminalSplitView.vue'),
    meta: { requiresAuth: true, layout: 'authenticated' },
  },
  {
    path: '/tree',
    component: () => import('@/views/TreeDemo.vue'),
    meta: { requiresAuth: false },
  },
  { path: '/:pathMatch(.*)*', redirect: '/terminal' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/login' && auth.isAuthenticated) {
    return { path: '/terminal' }
  }
  return true
})

export default router
