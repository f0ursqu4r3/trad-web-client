<script setup lang="ts">
import { DockviewVue, type DockviewReadyEvent, themeDark, themeLight } from 'dockview-vue'
import { createApp, h, type Component, ref, onBeforeUnmount, computed } from 'vue'
import { useUiStore } from '@/stores/ui'

const LAYOUT_KEY = 'terminalLayoutV1'
type DockviewApi = DockviewReadyEvent['api']
const apiRef = ref<DockviewApi | null>(null)
let saveInterval: number | null = null

const ui = useUiStore()
const themeLabel = computed(() => (ui.theme === 'dark' ? '☀️' : '🌙'))
const currentTheme = computed(() => (ui.theme === 'dark' ? themeDark : themeLight))

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
  <div class="terminal-view">
    <div class="toolbar">
      <div class="left-group">
        <span> Trading Terminal </span>
      </div>

      <div class="right-group">
        <button
          @click="ui.toggleTheme()"
          :style="{
            backgroundColor: ui.theme === 'dark' ? '#444' : '#ddd',
            color: ui.theme === 'dark' ? '#ddd' : '#444',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
          }"
        >
          {{ themeLabel }}
        </button>
      </div>
    </div>

    <div class="dockview-wrapper dockview-theme-trad">
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
  </div>
</template>

<style scoped>
.terminal-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 4px;
}

.toolbar .left-group {
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar .right-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar button {
  transition:
    background-color 0.3s,
    color 0.3s;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.dockview-wrapper {
  flex-grow: 1;
  inset: 0;
  box-sizing: border-box;
  user-select: none;
}
.dv-instance {
  width: 100%;
  height: 100%;
}
</style>
