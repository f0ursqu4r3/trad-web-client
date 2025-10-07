<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { SunIcon, MoonIcon, ComputerDesktopIcon, SparklesIcon } from '@/components/icons'
import { useUiStore, type ThemeMode } from '@/stores/ui'

const uiStore = useUiStore()
const showMenu = ref(false)
const currentTheme = ref(uiStore.theme)

// Refs for dynamic positioning
const anchorRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

const currentThemeLabel = computed(
  () => themeOptions.find((option) => option.value === currentTheme.value)?.label || 'Theme',
)

const currentThemeIcon = computed(
  () => themeOptions.find((option) => option.value === currentTheme.value)?.icon || SparklesIcon,
)

interface ThemeOption {
  label: string
  value: ThemeMode
  icon: typeof SunIcon | typeof MoonIcon | typeof ComputerDesktopIcon
}

const themeOptions: ThemeOption[] = [
  { label: 'System', value: 'system', icon: ComputerDesktopIcon },
  { label: 'Light', value: 'light', icon: SunIcon },
  { label: 'Dark', value: 'dark', icon: MoonIcon },
  { label: 'Synthwave', value: 'synthwave', icon: MoonIcon },
  { label: 'Legacy', value: 'legacy', icon: MoonIcon },
  { label: 'Fantasy24', value: 'fantasy24', icon: MoonIcon },
  { label: 'Tomorrow Night 80s', value: 'tomorrowNight80s', icon: MoonIcon },
]

function toggleMenu() {
  showMenu.value = !showMenu.value
}

function setTheme(theme: ThemeMode) {
  uiStore.setTheme(theme)
  currentTheme.value = theme
  showMenu.value = false
}

function clampDropdown() {
  if (!showMenu.value) return
  const anchorEl = anchorRef.value
  const menuEl = menuRef.value
  if (!anchorEl || !menuEl) return

  // Allow intrinsic width (content-based). Override Tailwind min-w if present.
  menuEl.style.minWidth = '0'
  menuEl.style.width = 'max-content'

  // Force reflow after width adjustments
  const a = anchorEl.getBoundingClientRect()
  const m = menuEl.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Preferred placement: bottom-end
  let top = a.bottom + 4
  let left = a.right - m.width

  const margin = 4
  if (left + m.width > vw - margin) left = vw - m.width - margin
  if (left < margin) left = margin

  if (top + m.height > vh - margin && a.top - m.height - 4 > margin) {
    top = a.top - m.height - 4
  }
  if (top < margin) top = margin

  menuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: '1000',
    width: 'max-content',
  }
}

watch(showMenu, async (v) => {
  if (v) {
    await nextTick()
    clampDropdown()
  }
})

function onWindowEvents() {
  clampDropdown()
}

onMounted(() => {
  window.addEventListener('resize', onWindowEvents)
  window.addEventListener('scroll', onWindowEvents, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowEvents)
  window.removeEventListener('scroll', onWindowEvents, true)
})
</script>

<template>
  <div class="menu-anchor" ref="anchorRef">
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

    <div
      v-if="showMenu"
      ref="menuRef"
      class="menu-dropdown"
      role="menu"
      :style="menuStyle"
      @mouseleave="showMenu = false"
    >
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
