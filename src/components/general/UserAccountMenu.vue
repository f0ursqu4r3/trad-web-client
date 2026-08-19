<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronDown,
  CreditCard,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  WalletCards,
} from 'lucide-vue-next'
import { useAuth } from '@/lib/auth'
import { useUserStore } from '@/stores/user'
import DropMenu from '@/components/general/DropMenu.vue'
import ProfileIcon from '@/components/general/ProfileIcon.vue'

const router = useRouter()
const user = useUserStore()
const { logout } = useAuth()
const menu = ref<InstanceType<typeof DropMenu> | null>(null)

const initial = computed(() => (user.displayName.trim().charAt(0) || '?').toUpperCase())
const identity = computed(() => user.profile.display_name?.trim() || 'Trad account')

function open(path: string): void {
  menu.value?.close()
  void router.push(path)
}

function signOut(): void {
  menu.value?.close()
  logout({ returnTo: window.location.origin })
}
</script>

<template>
  <DropMenu ref="menu">
    <template #trigger="{ toggle, open: isOpen }">
      <button
        class="user-account-trigger"
        type="button"
        data-tour="terminal-settings"
        title="Account and settings"
        aria-label="Account and settings"
        aria-haspopup="menu"
        :aria-expanded="isOpen"
        @click.stop="toggle"
      >
        <span class="user-avatar">
          <ProfileIcon :icon="user.profileIcon" :initial="initial" :size="18" />
        </span>
        <ChevronDown :size="13" aria-hidden="true" />
      </button>
    </template>
    <template #items>
      <div class="user-menu">
        <div class="user-menu-identity">
          <div class="user-menu-avatar">
            <ProfileIcon :icon="user.profileIcon" :initial="initial" :size="22" />
          </div>
          <div class="min-w-0">
            <strong>{{ identity }}</strong>
            <span>{{ user.email || user.userId }}</span>
          </div>
        </div>
        <div class="user-menu-role">{{ user.role.replace('_', ' ') }}</div>
        <div class="user-menu-divider"></div>
        <button role="menuitem" @click="open('/settings/profile')">
          <UserRound :size="16" /> Profile
        </button>
        <button role="menuitem" @click="open('/settings/accounts')">
          <WalletCards :size="16" /> Trading accounts
        </button>
        <button role="menuitem" @click="open('/settings/preferences')">
          <SlidersHorizontal :size="16" /> Preferences
        </button>
        <button role="menuitem" @click="open('/settings/billing')">
          <CreditCard :size="16" /> Billing
        </button>
        <button v-if="user.isAdmin" role="menuitem" @click="open('/admin/operations')">
          <ShieldCheck :size="16" /> Administration
        </button>
        <button role="menuitem" @click="open('/settings/profile')">
          <Settings :size="16" /> All settings
        </button>
        <div class="user-menu-divider"></div>
        <button class="user-menu-logout" role="menuitem" @click="signOut">
          <LogOut :size="16" /> Log out
        </button>
      </div>
    </template>
  </DropMenu>
</template>

<style scoped>
.user-account-trigger {
  display: inline-flex;
  min-width: 48px;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border: 1px solid transparent;
  color: var(--fg-muted);
  cursor: pointer;
}
.user-account-trigger:hover,
.user-account-trigger[aria-expanded='true'] {
  border-color: var(--border-normal);
  background: var(--surface-hover);
  color: var(--fg-strong);
}
.user-account-trigger:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring-strong);
}
.user-avatar,
.user-menu-avatar {
  display: grid;
  place-items: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent-color) 62%, #152238);
  color: var(--fg-on-accent);
  font-weight: 700;
}
.user-avatar {
  width: 30px;
  height: 30px;
  font-size: 13px;
}
.user-menu {
  width: 280px;
  padding: 0.5rem;
  font-size: 13px;
}
.user-menu-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem;
}
.user-menu-avatar {
  width: 40px;
  height: 40px;
  flex: none;
  font-size: 16px;
}
.user-menu-identity strong,
.user-menu-identity span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-menu-identity strong {
  color: var(--fg-strong);
  font-size: 14px;
  font-weight: 600;
}
.user-menu-identity span {
  margin-top: 0.15rem;
  color: var(--fg-muted);
  font-size: 12px;
}
.user-menu-role {
  margin: 0 0.65rem 0.3rem;
  color: var(--fg-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.user-menu-divider {
  height: 1px;
  margin: 0.4rem 0;
  background: var(--border-subtle);
}
.user-menu button {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  gap: 0.7rem;
  padding: 0.45rem 0.65rem;
  color: var(--fg);
  text-align: left;
}
.user-menu button:hover,
.user-menu button:focus-visible {
  background: var(--surface-hover);
  color: var(--fg-strong);
  outline: none;
}
.user-menu .user-menu-logout {
  color: var(--state-error);
}
</style>
