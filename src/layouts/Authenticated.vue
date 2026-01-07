<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="relative w-full h-full overflow-hidden flex flex-col">
    <div class="toolbar-row">
      <div class="toolbar-section">
        <span class="muted">logged in as</span>
        <span class="text-term-accent">{{ username }}</span>
        <span class="muted">|</span>
        <AccountSelect />
      </div>
      <div class="toolbar-section">
        <CommandInputModal />
      </div>
      <div class="toolbar-section">
        <WsIndicator />
        <button
          class="btn icon-btn"
          @click="ui.openSettings()"
          title="Settings"
          aria-label="Settings"
        >
          <CogIcon />
        </button>
      </div>
    </div>
    <UserSettings :open="ui.settingsOpen" @close="ui.closeSettings()" />
    <slot></slot>
    <CommandModalContainer />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CogIcon } from '@/components/icons'
import { useUserStore } from '@/stores/user'
import { useUiStore } from '@/stores/ui'

import WsIndicator from '@/components/general/WsIndicator.vue'
import UserSettings from '@/components/terminal/modals/UserSettings.vue'
import AccountSelect from '@/components/general/AccountSelect.vue'
import CommandInputModal from '@/components/terminal/modals/commands/CommandInputModal.vue'
import CommandModalContainer from '@/components/terminal/modals/commands/CommandModalContainer.vue'

const userStore = useUserStore()
const ui = useUiStore()

const username = computed(() => userStore.displayName || 'anonymous')
</script>
