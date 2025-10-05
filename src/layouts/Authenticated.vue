<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="relative w-full h-full overflow-hidden flex flex-col">
    <div class="toolbar-row">
      <div class="toolbar-section mr-auto">
        <span class="muted">logged in as</span>
        <span class="text-term-accent">{{ username }}</span>
      </div>
      <div class="toolbar-section">
        <WsIndicator />
        <button
          class="btn icon-btn"
          @click="settingsOpen = true"
          title="Settings"
          aria-label="Settings"
        >
          <CogIcon />
        </button>
      </div>
    </div>
    <UserSettings :open="settingsOpen" @close="settingsOpen = false" />
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { CogIcon } from '@/components/icons'
import { useUserStore } from '@/stores/user'

import WsIndicator from '@/components/general/WsIndicator.vue'
import UserSettings from '@/components/terminal/modals/UserSettings.vue'

const userStore = useUserStore()

const settingsOpen = ref(false)

const username = computed(() => userStore.displayName || 'anonymous')
</script>
