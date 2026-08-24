<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  Activity,
  Boxes,
  BadgeDollarSign,
  BookOpenCheck,
  CreditCard,
  MonitorCog,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'
import GuidedPointer from '@/components/general/GuidedPointer.vue'
import AppHeader from '@/components/general/AppHeader.vue'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const section = computed(() =>
  route.path.startsWith('/settings/accounts/')
    ? 'accounts'
    : route.path.startsWith('/admin/users/')
      ? 'users'
      : String(route.params.section || 'profile'),
)
const area = computed(() => String(route.meta.controlArea || 'settings'))
const touringToAccounts = computed(
  () => route.path === '/settings/profile' && route.query.tour === 'accounts',
)

const settings = [
  { key: 'profile', label: 'Profile', icon: UserRound },
  { key: 'accounts', label: 'Trading accounts', icon: WalletCards },
  { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { key: 'billing', label: 'Billing', icon: CreditCard },
]
const admin = [
  { key: 'operations', label: 'Operations', icon: Activity },
  { key: 'users', label: 'Users & access', icon: UsersRound },
  { key: 'accounts', label: 'Account health', icon: MonitorCog },
  { key: 'commerce', label: 'Plans & billing', icon: Boxes },
  { key: 'execution', label: 'Fees', icon: BadgeDollarSign },
  { key: 'audit', label: 'Audit history', icon: BookOpenCheck },
]

function openTradingAccounts(): void {
  void router.push({ path: '/settings/accounts', query: { tour: 'new-account' } })
}
</script>

<template>
  <div class="control-shell">
    <AppHeader class="control-app-header" />
    <span class="control-tour-origin" data-tour="control-origin" aria-hidden="true"></span>
    <aside class="control-sidebar">
      <nav aria-label="Settings">
        <div class="control-nav-label">User settings</div>
        <RouterLink
          v-for="item in settings"
          :key="item.key"
          :to="`/settings/${item.key}`"
          class="control-nav-item"
          :class="{ active: area === 'settings' && section === item.key }"
          :data-tour="item.key === 'accounts' ? 'trading-accounts' : undefined"
        >
          <component :is="item.icon" :size="14" /><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <nav v-if="user.isAdmin" class="control-admin-nav" aria-label="Administration">
        <div class="control-nav-label">
          <span>Administration</span><span class="control-admin-tag">admin</span>
        </div>
        <RouterLink
          v-for="item in admin"
          :key="item.key"
          :to="`/admin/${item.key}`"
          class="control-nav-item"
          :class="{ active: area === 'admin' && section === item.key }"
        >
          <component :is="item.icon" :size="14" /><span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="control-sidebar-footer">
        <span class="pill" :class="user.isAdmin ? 'pill-warn' : 'pill-info'">{{ user.role }}</span>
        <span class="truncate">{{ user.email }}</span>
      </div>
    </aside>
    <main class="control-main">
      <div class="control-content"><slot /></div>
    </main>
    <GuidedPointer
      v-if="touringToAccounts"
      source-selector="[data-tour='control-origin']"
      target-selector="[data-tour='trading-accounts']"
      @arrive="openTradingAccounts"
    />
  </div>
</template>

<style>
.control-shell {
  display: grid;
  grid-template-columns: 238px minmax(0, 1fr);
  grid-template-rows: 46px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--surface-canvas);
}
.control-app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  grid-column: 1 / -1;
}
.control-sidebar {
  position: sticky;
  top: 46px;
  display: flex;
  height: calc(100vh - 46px);
  flex-direction: column;
  border-right: 1px solid var(--border-normal);
  background: var(--surface-muted);
}
.control-sidebar nav {
  padding: 0.75rem 0.5rem 0;
}
.control-sidebar .control-admin-nav {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border-subtle);
}
.control-nav-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 0.5rem;
  color: var(--fg-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.control-admin-tag {
  padding: 0.1rem 0.3rem;
  border: 1px solid color-mix(in srgb, var(--state-warning) 45%, var(--border-normal));
  color: var(--state-warning);
  font-size: 11px;
  letter-spacing: 0.08em;
}
.control-nav-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 38px;
  padding: 0.6rem 0.65rem;
  border-left: 2px solid transparent;
  color: var(--fg-muted);
  font-size: 13px;
}
.control-nav-item:hover {
  background: var(--row-hover-bg);
  color: var(--fg);
}
.control-nav-item.active {
  border-left-color: var(--accent-color);
  background: var(--surface-selected);
  color: var(--fg-strong);
}
.control-sidebar-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-top: 1px solid var(--border-subtle);
  color: var(--fg-muted);
  font-size: 12px;
}
.control-main {
  min-width: 0;
  grid-column: 2;
  grid-row: 2;
  font-size: 13px;
  line-height: 1.5;
}
.control-tour-origin {
  position: fixed;
  z-index: 11;
  top: 23px;
  right: 1rem;
  width: 1px;
  height: 1px;
}
.control-content {
  width: min(1180px, 100%);
  padding: 1.5rem;
}
@media (max-width: 760px) {
  .control-shell {
    grid-template-columns: 58px minmax(0, 1fr);
  }
  .control-nav-item span,
  .control-nav-label,
  .control-sidebar-footer span:not(.pill) {
    display: none;
  }
  .control-nav-item {
    justify-content: center;
  }
  .control-content {
    padding: 0.75rem;
  }
}
</style>
