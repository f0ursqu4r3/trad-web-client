<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed } from 'vue'
import { SunIcon, MoonIcon, LogoutIcon } from '@/components/icons'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

import WsIndicator from '@/components/general/WsIndicator.vue'

const ui = useUiStore()
const auth = useAuthStore()

const themeIcon = computed(() => (ui.theme === 'dark' ? SunIcon : MoonIcon))
const themeToggleLabel = computed(() =>
  ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
)
</script>

<template>
  <div class="layout">
    <div class="toolbar">
      <div class="left-group">
        <div class="button" @click="auth.logout">
          <LogoutIcon />
        </div>
        <span> Trading Terminal </span>
      </div>
      <div class="right-group">
        <WsIndicator />
        <button
          @click="ui.toggleTheme()"
          class="theme-toggle"
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

<style scoped>
.layout {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 4px;
}

.toolbar .left-group {
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar .right-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-indicator {
  user-select: none;
  width: 0.8em;
  height: 0.8em;
  display: inline-flex;
  border-radius: 50%;
  /* we are using a rounded div instead of emoji so we can animate it */
  justify-content: center;
  align-items: center;
  font-weight: bold;
  transition: background-color 0.3s;
  background-color: #9e9e9e; /* Grey */
  border: 1px solid rgba(158, 158, 158, 0.25);
  box-shadow:
    0 0 0 4px rgba(158, 158, 158, 0.14),
    0 3px 8px rgba(0, 0, 0, 0.4);
  font-size: 1em;
}

.ws-indicator[data-status='ready'] {
  background-color: #00c853; /* vivid green */
  border: 1px solid rgba(0, 200, 83, 0.2);
  box-shadow:
    0 0 0 4px rgba(0, 200, 83, 0.12),
    0 3px 8px rgba(0, 0, 0, 0.35);
}
.ws-indicator[data-status='connecting'] {
  background-color: #ffb300; /* bold amber */
  border: 1px solid rgba(255, 179, 0, 0.2);
  box-shadow:
    0 0 0 4px rgba(255, 179, 0, 0.12),
    0 3px 8px rgba(0, 0, 0, 0.25);
}
.ws-indicator[data-status='reconnecting'] {
  background-color: #ff6d00; /* strong orange */
  border: 1px solid rgba(255, 109, 0, 0.2);
  box-shadow:
    0 0 0 4px rgba(255, 109, 0, 0.12),
    0 3px 8px rgba(0, 0, 0, 0.28);
}
.ws-indicator[data-status='error'] {
  background-color: #d50000; /* vivid red */
  border: 1px solid rgba(213, 0, 0, 0.25);
  box-shadow:
    0 0 0 4px rgba(213, 0, 0, 0.14),
    0 3px 8px rgba(0, 0, 0, 0.4);
}

/* Theme toggle button */
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  background: linear-gradient(var(--btn-bg-start, #efefef), var(--btn-bg-end, #d9d9d9));
  color: var(--btn-fg, #222);
  border: 1px solid var(--btn-border, #c2c2c2);
  transition: filter 0.25s ease;
}
.theme-toggle:hover {
  filter: brightness(1.1);
}
.theme-toggle:active {
  filter: brightness(0.9);
}
.theme-toggle:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}
.theme-icon {
  display: block;
  width: 16px;
  height: 16px;
}
</style>
