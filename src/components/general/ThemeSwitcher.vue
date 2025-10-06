<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  SunIcon,
  MoonIcon,
  MenuDotsIcon,
  ComputerDesktopIcon,
  BoltIcon,
  StarIcon,
  SparklesIcon,
} from '@/components/icons'
import { useUiStore, type ThemeMode } from '@/stores/ui'

const uiStore = useUiStore()
const showMenu = ref(false)
const currentTheme = ref(uiStore.theme)

const currentThemeLabel = computed(() => {
  return currentTheme.value.charAt(0).toUpperCase() + currentTheme.value.slice(1)
})

const currentThemeIcon = computed(() => {
  switch (currentTheme.value) {
    case 'light':
      return SunIcon
    case 'dark':
      return MoonIcon
    case 'system':
      return ComputerDesktopIcon
    case 'synthwave':
      return BoltIcon
    case 'legacy':
      return StarIcon
    case 'fantasy24':
      return SparklesIcon
    default:
      return MenuDotsIcon
  }
})

interface ThemeOption {
  label: string
  value: ThemeMode
  icon:
    | typeof SunIcon
    | typeof MoonIcon
    | typeof MenuDotsIcon
    | typeof ComputerDesktopIcon
    | typeof BoltIcon
    | typeof StarIcon
}

const themeOptions: ThemeOption[] = [
  { label: 'System', value: 'system', icon: ComputerDesktopIcon },
  { label: 'Light', value: 'light', icon: SunIcon },
  { label: 'Dark', value: 'dark', icon: MoonIcon },
  { label: 'Synthwave', value: 'synthwave', icon: BoltIcon },
  { label: 'Legacy', value: 'legacy', icon: StarIcon },
  { label: 'Fantasy24', value: 'fantasy24', icon: SparklesIcon },
]

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function setTheme(theme: ThemeMode) {
  uiStore.setTheme(theme)
  currentTheme.value = theme
  showMenu.value = false
}
</script>

<template>
  <div class="menu-anchor">
    <button
      class="btn btn-sm icon-btn"
      title="Theme"
      aria-haspopup="menu"
      :aria-expanded="showMenu ? 'true' : 'false'"
      @click="toggleMenu"
      @keydown.enter.prevent="toggleMenu"
      @keydown.space.prevent="toggleMenu"
    >
      <component :is="currentThemeIcon" size="16" />
      {{ currentThemeLabel }}
    </button>

    <div v-if="showMenu" class="menu-dropdown" role="menu" @mouseleave="showMenu = false">
      <button
        v-for="option in themeOptions"
        :key="option.value"
        type="button"
        class="menu-item"
        role="menuitemradio"
        :aria-checked="currentTheme === option.value ? 'true' : 'false'"
        @click="setTheme(option.value)"
        @keydown.enter.prevent="setTheme(option.value)"
        @keydown.space.prevent="setTheme(option.value)"
      >
        <component :is="option.icon" class="icon" size="12" /> {{ option.label }}
      </button>
    </div>
  </div>
</template>
