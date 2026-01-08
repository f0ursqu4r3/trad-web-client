import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useUserStore } from './user'

export type ThemeMode =
  | 'dark'
  | 'light'
  | 'synthwave'
  | 'system'
  | 'legacy'
  | 'fantasy24'
  | 'tomorrowNight80s'
  | 'monokai'
  | 'dracula'
  | 'nord'
  | 'gruvbox'
  | 'solarized'
  | 'oneDark'
  | 'catppuccin'
  | 'tokyoNight'
  | 'bloomberg'
  | 'cyberpunk'
  | 'rosePine'
  | 'solarizedLight'
  | 'githubLight'
  | 'oneLight'
  | 'nordLight'
  | 'rosePineDawn'

export const useUiStore = defineStore(
  'ui',
  () => {
    const theme = ref<ThemeMode>('system')
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

    const effectiveTheme = computed<Exclude<ThemeMode, 'system'>>(() =>
      theme.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : theme.value,
    )

    function setTheme(t: ThemeMode) {
      theme.value = t
      useUserStore().saveProfile()
    }

    function toggleTheme() {
      setTheme(theme.value === 'dark' ? 'light' : 'dark')
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

    return {
      theme,
      effectiveTheme,
      systemPrefersDark,
      setTheme,
      toggleTheme,
      getVar,
      settingsOpen,
      openSettings,
      closeSettings,
    }
  },
  {
    persist: { key: 'trad-ui-store', pick: ['theme'] },
  },
)
