import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import 'dockview-vue/dist/styles/dockview.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'

import TerminalLogPanel from '@/components/terminal/panels/LogPanel.vue'
import TerminalChartPanel from '@/components/terminal/panels/ChartPanel.vue'
import TerminalOrderTree from '@/components/terminal/panels/OrderTreePanel.vue'
import TerminalEntriesPanel from '@/components/terminal/panels/EntriesPanel.vue'
import TerminalCommandInput from '@/components/terminal/panels/CommandInputPanel.vue'
import TerminalDeviceDetails from '@/components/terminal/panels/DeviceDetailsPanel.vue'
import TerminalInboundDebug from './components/terminal/panels/InboundDebugPanel.vue'

import { auth0, setAuth0Client } from '@/plugins/auth0'
import { useUiStore } from '@/stores/ui'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

app.use(router)
app.use(auth0)
setAuth0Client(app.config.globalProperties.$auth0)

app.component('LogPanel', TerminalLogPanel)
app.component('ChartPanel', TerminalChartPanel)
app.component('OrderTree', TerminalOrderTree)
app.component('EntriesPanel', TerminalEntriesPanel)
app.component('CommandInput', TerminalCommandInput)
app.component('DeviceDetails', TerminalDeviceDetails)
app.component('InboundDebug', TerminalInboundDebug)

app.mount('#app')

// Apply theme class after mount
const ui = useUiStore()
const rootEl = document.documentElement
function applyTheme() {
  rootEl.setAttribute('data-theme', ui.effectiveTheme)
}
applyTheme()
ui.$subscribe(() => applyTheme())
