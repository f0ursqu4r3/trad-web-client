<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="layout">
    <div class="toolbar-row">
      <div class="toolbar-section mr-auto">
        <button class="icon-btn" @click="auth.logout" title="Logout" aria-label="Logout">
          <LogoutIcon />
        </button>
        <span class="muted">logged in as</span>
        <span class="text-term-accent">{{ username }}</span>
      </div>
      <div class="toolbar-section">
        <WsIndicator />
        <button
          @click="ui.toggleTheme()"
          class="icon-btn"
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
import { SunIcon, MoonIcon, LogoutIcon } from '@/components/icons'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

import WsIndicator from '@/components/general/WsIndicator.vue'

const ui = useUiStore()
const auth = useAuthStore()
const router = useRouter()

const username = computed(() => auth.username || 'anonymous')
const themeIcon = computed(() => (ui.theme === 'dark' ? SunIcon : MoonIcon))
const themeToggleLabel = computed(() =>
  ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
)

watch(
  () => auth.isAuthenticated,
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
