<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore, type NumberDisplayMode, type ThemeMode } from '@/stores/ui'
import { useUserStore } from '@/stores/user'
import type { OrderQuantityMode } from '@/lib/ws/protocol'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import ControlSection from '@/components/control/ControlSection.vue'

const ui = useUiStore()
const user = useUserStore()
const saved = ref(false)

async function save() {
  user.profile.meta ||= {}
  user.profile.meta.preferences = {
    ...user.profile.meta.preferences,
    theme: ui.theme,
    number_display_mode: ui.numberDisplayMode,
    newest_commands_first: ui.newestCommandsFirst,
    confirm_position_closes: ui.confirmPositionCloses,
    order_quantity_mode: ui.orderQuantityMode,
  }
  saved.value = false
  await user.saveProfile()
  saved.value = !user.error
}
</script>

<template>
  <ControlPageHeader
    eyebrow="User settings"
    title="Preferences"
    description="Terminal display, ordering, sizing, and safety confirmations."
  />
  <ControlSection title="Appearance">
    <div class="control-form-grid">
      <label class="field control-field-panel"
        ><span class="field-label">Theme</span
        ><select v-model="ui.theme" class="input">
          <option
            v-for="theme in [
              'system',
              'dark',
              'light',
              'bloomberg',
              'tokyoNight',
              'oneDark',
              'nord',
              'gruvbox',
              'solarized',
              'monokai',
              'dracula',
              'catppuccin',
              'rosePine',
            ]"
            :key="theme"
            :value="theme as ThemeMode"
          >
            {{ theme }}
          </option>
        </select></label
      >
      <label class="field control-field-panel"
        ><span class="field-label">Number display</span
        ><select v-model="ui.numberDisplayMode" class="input">
          <option :value="'compact' as NumberDisplayMode">Compact</option>
          <option :value="'full' as NumberDisplayMode">Full precision</option>
        </select></label
      >
    </div>
  </ControlSection>
  <ControlSection title="Trading terminal">
    <div class="control-form-grid">
      <label class="field control-field-panel"
        ><span class="field-label">Default quantity</span
        ><select v-model="ui.orderQuantityMode" class="input">
          <option :value="'notional' as OrderQuantityMode">Notional</option>
          <option :value="'base' as OrderQuantityMode">Asset quantity</option>
          <option :value="'risk' as OrderQuantityMode">Risk</option>
        </select></label
      >
      <label class="control-check control-field-panel"
        ><input v-model="ui.newestCommandsFirst" type="checkbox" />Newest commands first</label
      ><label class="control-check control-field-panel"
        ><input v-model="ui.confirmPositionCloses" type="checkbox" />Confirm position-closing
        actions</label
      >
    </div>
  </ControlSection>
  <div
    class="control-actions mt-0 border border-[var(--border-normal)] bg-[var(--surface-base)] px-4 pb-4"
  >
    <button class="btn btn-primary" :disabled="user.loading" @click="save">Save preferences</button
    ><span v-if="saved" class="notice-ok m-0">Saved.</span
    ><span v-if="user.error" class="notice-err m-0">{{ user.error }}</span>
  </div>
</template>
