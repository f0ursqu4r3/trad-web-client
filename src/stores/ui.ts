import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'

export type ThemeMode =
  | 'dark'
  | 'light'
  | 'synthwave'
  | 'system'
  | 'legacy'
  | 'fantasy24'
  | 'tomorrowNight80s'
const STORAGE_KEY = 'ui.theme.v1'

function loadInitial(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (
    saved === 'light' ||
    saved === 'dark' ||
    saved === 'synthwave' ||
    saved === 'system' ||
    saved === 'legacy' ||
    saved === 'fantasy24' ||
    saved === 'tomorrowNight80s'
  )
    return saved as ThemeMode
  // Prefer OS setting
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeMode>(loadInitial())
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
  }

  function getVar(name: string, fallback?: string | undefined): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() ?? fallback
  }

  // Persist chosen theme *not* effective theme
  watch(theme, (t) => localStorage.setItem(STORAGE_KEY, t), { immediate: true })

  return { theme, effectiveTheme, systemPrefersDark, setTheme, getVar }
})
