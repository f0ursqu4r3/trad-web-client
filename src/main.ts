import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import 'dockview-vue/dist/styles/dockview.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'

import ChartPanel from '@/components/terminal/panels/ChartPanel.vue'
import DeviceTreePanel from '@/components/terminal/panels/DeviceTreePanel.vue'
import DeviceDetailsPanel from '@/components/terminal/panels/DeviceDetailsPanel.vue'
import InboundDebugPanel from './components/terminal/panels/InboundDebugPanel.vue'

import { auth0, setAuth0Client } from '@/plugins/auth0'
import { useUiStore } from '@/stores/ui'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

app.use(router)
app.use(auth0)
setAuth0Client(app.config.globalProperties.$auth0)

app.component('ChartPanel', ChartPanel)
app.component('DeviceTreePanel', DeviceTreePanel)
app.component('DeviceDetailsPanel', DeviceDetailsPanel)
app.component('InboundDebugPanel', InboundDebugPanel)

app.mount('#app')

// Apply theme class after mount
const ui = useUiStore()
const rootEl = document.documentElement
function applyTheme() {
  rootEl.setAttribute('data-theme', ui.effectiveTheme)
}
applyTheme()
ui.$subscribe(() => applyTheme())
