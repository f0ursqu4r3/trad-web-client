import { createApp } from 'vue'
import { createHead } from '@unhead/vue/client'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import 'dockview-vue/dist/styles/dockview.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'

import { createBffAuthProvider } from '@/plugins/bffAuth'
import { clearLegacyAuthStorage, setAuthProvider } from '@/lib/auth'
import { applyEnvironmentBranding } from '@/lib/environmentBranding'
import { useUiStore } from '@/stores/ui'

applyEnvironmentBranding()

const app = createApp(App)

const head = createHead()
app.use(head)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

clearLegacyAuthStorage()
setAuthProvider(createBffAuthProvider())

app.use(router)

app.mount('#app')

// Apply theme class after mount
const ui = useUiStore()
const rootEl = document.documentElement
function applyTheme() {
  rootEl.setAttribute('data-theme', ui.effectiveTheme)
}
applyTheme()
ui.$subscribe(() => applyTheme())
