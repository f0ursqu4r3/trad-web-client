<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="layout">
    <div class="toolbar-row">
      <div class="toolbar-section mr-auto">
        <button class="btn icon-btn" @click="logoutUser" title="Logout" aria-label="Logout">
          <LogoutIcon />
        </button>
        <span class="muted">logged in as</span>
        <span class="text-term-accent">{{ username }}</span>
      </div>
      <div class="toolbar-section">
        <WsIndicator />
        <button
          @click="ui.toggleTheme()"
          class="btn icon-btn"
          :aria-label="themeToggleLabel"
          :title="themeToggleLabel"
        >
          <component :is="themeIcon" :size="16" />
        </button>
      </div>
    </div>
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { SunIcon, MoonIcon, LogoutIcon } from '@/components/icons'
import { useUiStore } from '@/stores/ui'
import { useUserStore } from '@/stores/user'

import WsIndicator from '@/components/general/WsIndicator.vue'

const ui = useUiStore()
const { isAuthenticated, logout } = useAuth0()
const userStore = useUserStore()
const router = useRouter()

const username = computed(() => userStore.displayName || 'anonymous')
const themeIcon = computed(() => (ui.theme === 'dark' ? SunIcon : MoonIcon))
const themeToggleLabel = computed(() =>
  ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
)

const logoutUser = async () => {
  await logout({ logoutParams: { returnTo: window.location.origin } })
}

watch(
  () => isAuthenticated.value,
  (isAuth) => {
    if (!isAuth) {
      router.push({ path: '/login' })
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.layout {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
