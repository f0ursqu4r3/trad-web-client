import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeMode = 'dark' | 'light'
const STORAGE_KEY = 'ui.theme.v1'

function loadInitial(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  // Prefer OS setting
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<ThemeMode>(loadInitial())

  function setTheme(t: ThemeMode) {
    theme.value = t
  }
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  watch(theme, (t) => localStorage.setItem(STORAGE_KEY, t), { immediate: true })

  return { theme, setTheme, toggleTheme }
})
