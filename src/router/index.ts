import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/terminal' },
  { path: '/terminal', component: () => import('@/views/TradingTerminal.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/terminal' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
