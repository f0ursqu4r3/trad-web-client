import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'dockview-vue/dist/styles/dockview.css'
import './assets/main.css'

import App from './App.vue'
import router from './router'

import TerminalLogPanel from '@/components/terminal/TerminalLogPanel.vue'
import TerminalChartPanel from '@/components/terminal/TerminalChartPanel.vue'
import TerminalOrderTree from '@/components/terminal/TerminalOrderTree.vue'
import TerminalEntriesPanel from '@/components/terminal/TerminalEntriesPanel.vue'
import TerminalCommandInput from '@/components/terminal/TerminalCommandInput.vue'
import TerminalDeviceDetails from '@/components/terminal/TerminalDeviceDetails.vue'
import { useUiStore } from '@/stores/ui'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.component('LogPanel', TerminalLogPanel)
app.component('ChartPanel', TerminalChartPanel)
app.component('OrderTree', TerminalOrderTree)
app.component('EntriesPanel', TerminalEntriesPanel)
app.component('CommandInput', TerminalCommandInput)
app.component('DeviceDetails', TerminalDeviceDetails)

app.mount('#app')

// Apply theme class after mount
const ui = useUiStore()
const rootEl = document.documentElement
function applyTheme() {
  rootEl.classList.toggle('theme-light', ui.theme === 'light')
}
applyTheme()
ui.$subscribe(() => applyTheme())
