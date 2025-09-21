<script setup lang="ts">
import { DockviewVue, type DockviewReadyEvent, themeDracula, themeLight } from 'dockview-vue'
import { createApp, h, type Component, ref, onBeforeUnmount, computed } from 'vue'
import { useUiStore } from '@/stores/ui'

const LAYOUT_KEY = 'terminalLayoutV1'
type DockviewApi = DockviewReadyEvent['api']
const apiRef = ref<DockviewApi | null>(null)
let saveInterval: number | null = null
const ui = useUiStore()
const themeLabel = computed(() => (ui.theme === 'dark' ? 'Light Theme' : 'Dark Theme'))
const currentTheme = computed(() => (ui.theme === 'dark' ? themeDracula : themeLight))

function mountComponent(componentName: string) {
  return () => {
    const el = document.createElement('div')
    const app = createApp({ render: () => h(componentName as unknown as Component) })
    app.mount(el)
    return {
      element: el,
      update() {},
      dispose() {
        app.unmount()
      },
    }
  }
}

function loadSavedLayout(event: DockviewReadyEvent) {
  const raw = localStorage.getItem(LAYOUT_KEY)
  if (!raw) return false
  try {
    const json = JSON.parse(raw)
    event.api.fromJSON(json)
    return true
  } catch (e) {
    console.warn('[Layout Restore Failed]', e)
    return false
  }
}

function persistLayout() {
  if (!apiRef.value) return
  try {
    const json = apiRef.value.toJSON()
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(json))
  } catch (e) {
    console.warn('[Layout Save Failed]', e)
  }
}

function resetLayout() {
  localStorage.removeItem(LAYOUT_KEY)
  if (!apiRef.value) return
  apiRef.value.closeAllGroups()
  // rebuild default
  buildDefaultLayout({ api: apiRef.value } as DockviewReadyEvent)
  persistLayout()
}

function buildDefaultLayout(event: DockviewReadyEvent) {
  try {
    event.api.addPanel({ id: 'log', component: 'LogPanel', title: 'Log' })
    event.api.addPanel({
      id: 'tree',
      component: 'OrderTree',
      title: 'Tree',
      position: { referencePanel: 'log', direction: 'below' },
    })
    event.api.addPanel({
      id: 'chart',
      component: 'ChartPanel',
      title: 'Chart',
      position: { referencePanel: 'log', direction: 'right' },
    })
    event.api.addPanel({
      id: 'details',
      component: 'DeviceDetails',
      title: 'Details',
      position: { referencePanel: 'chart', direction: 'right' },
    })
    event.api.addPanel({
      id: 'entries',
      component: 'EntriesPanel',
      title: 'Entries',
      position: { referencePanel: 'chart', direction: 'below' },
    })
    event.api.addPanel({
      id: 'cmd',
      component: 'CommandInput',
      title: 'Command',
      position: { referencePanel: 'entries', direction: 'within' },
    })
  } catch (e) {
    console.error('[Dockview Layout Error]', e)
  }
}

function onReady(event: DockviewReadyEvent) {
  apiRef.value = event.api
  const restored = loadSavedLayout(event)
  if (!restored) buildDefaultLayout(event)
  saveInterval = window.setInterval(persistLayout, 3000)
  window.addEventListener('beforeunload', persistLayout)
}

onBeforeUnmount(() => {
  if (saveInterval) window.clearInterval(saveInterval)
  window.removeEventListener('beforeunload', persistLayout)
})
</script>

<template>
  <div class="dockview-wrapper dockview-theme-trad">
    <div class="toolbar">
      <button @click="resetLayout">Reset Layout</button>
      <button @click="ui.toggleTheme()">{{ themeLabel }}</button>
    </div>
    <DockviewVue
      class="dv-instance"
      @ready="onReady"
      :theme="currentTheme"
      single-tab-mode="fullwidth"
      :components="{
        LogPanel: mountComponent('LogPanel'),
        ChartPanel: mountComponent('ChartPanel'),
        OrderTree: mountComponent('OrderTree'),
        EntriesPanel: mountComponent('EntriesPanel'),
        CommandInput: mountComponent('CommandInput'),
        DeviceDetails: mountComponent('DeviceDetails'),
      }"
    />
  </div>
</template>

<style scoped>
.dockview-wrapper {
  position: absolute;
  inset: 0;
  padding: 4px;
  box-sizing: border-box;
  user-select: none;
}
.dv-instance {
  width: 100%;
  height: 100%;
}
.toolbar {
  position: absolute;
  top: 4px;
  right: 8px;
  z-index: 10;
  display: flex;
  gap: 4px;
}
</style>
