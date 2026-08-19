import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useUserStore } from './user'
import type { OrderQuantityMode } from '@/lib/ws/protocol'

export type ThemeMode = 'dark' | 'light' | 'system'

const LEGACY_LIGHT_THEMES = new Set([
  'solarizedLight',
  'githubLight',
  'oneLight',
  'nordLight',
  'rosePineDawn',
])

export function normalizeTheme(value: unknown): ThemeMode {
  if (value === 'system' || value === 'dark' || value === 'light') return value
  if (LEGACY_LIGHT_THEMES.has(String(value))) return 'light'
  return 'dark'
}

export type NumberDisplayMode = 'compact' | 'full'

export const useUiStore = defineStore(
  'ui',
  () => {
    const theme = ref<ThemeMode>('system')
    const numberDisplayMode = ref<NumberDisplayMode>('compact')
    const newestCommandsFirst = ref(false)
    const confirmPositionCloses = ref(true)
    const orderQuantityMode = ref<OrderQuantityMode>('notional')
    const systemPrefersDark = ref<boolean>(
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false,
    )

    // Track system preference changes when in system mode
    let mql: MediaQueryList | null = null
    if (typeof window !== 'undefined') {
      mql = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        systemPrefersDark.value = e.matches
      }
      // Add listener (modern API) and fallback
      if (mql.addEventListener) mql.addEventListener('change', handler)
      else if ((mql as MediaQueryList).addListener) (mql as MediaQueryList).addListener(handler)
    }

    const effectiveTheme = computed<'dark' | 'light'>(() => {
      const selected = normalizeTheme(theme.value)
      return selected === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : selected
    })

    function setTheme(t: ThemeMode) {
      theme.value = t
      useUserStore().saveProfile()
    }

    function toggleTheme() {
      setTheme(effectiveTheme.value === 'dark' ? 'light' : 'dark')
    }

    function setNumberDisplayMode(mode: NumberDisplayMode) {
      numberDisplayMode.value = mode
      useUserStore().saveProfile()
    }

    function setNewestCommandsFirst(enabled: boolean) {
      newestCommandsFirst.value = enabled
      useUserStore().saveProfile()
    }

    function setConfirmPositionCloses(enabled: boolean) {
      confirmPositionCloses.value = enabled
      useUserStore().saveProfile()
    }

    function setOrderQuantityMode(mode: OrderQuantityMode) {
      orderQuantityMode.value = mode
    }

    function getVar(name: string, fallback?: string | undefined): string {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() ?? fallback
    }

    // Settings modal state
    const settingsOpen = ref(false)
    function openSettings() {
      settingsOpen.value = true
    }
    function closeSettings() {
      settingsOpen.value = false
    }

    const showInboundPanel = ref(false)
    function toggleInboundPanel() {
      showInboundPanel.value = !showInboundPanel.value
    }
    function setInboundPanelVisible(next: boolean) {
      showInboundPanel.value = next
    }

    return {
      theme,
      numberDisplayMode,
      newestCommandsFirst,
      confirmPositionCloses,
      orderQuantityMode,
      effectiveTheme,
      systemPrefersDark,
      setTheme,
      toggleTheme,
      setNumberDisplayMode,
      setNewestCommandsFirst,
      setConfirmPositionCloses,
      setOrderQuantityMode,
      getVar,
      settingsOpen,
      openSettings,
      closeSettings,
      showInboundPanel,
      toggleInboundPanel,
      setInboundPanelVisible,
    }
  },
  {
    persist: {
      key: 'trad-ui-store',
      pick: [
        'theme',
        'numberDisplayMode',
        'newestCommandsFirst',
        'confirmPositionCloses',
        'orderQuantityMode',
        'showInboundPanel',
      ],
    },
  },
)
