<template>
  <div class="w-full h-full">
    <DockviewVue
      class="w-full h-full"
      @ready="onReady"
      :theme="currentTheme"
      single-tab-mode="fullwidth"
      :components="{
        ChartPanel: mountComponent('ChartPanel'),
        // OrderTree: mountComponent('OrderTree'),
        DeviceDetailsPanel: mountComponent('DeviceDetailsPanel'),
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { createApp, h, type Component, ref, computed } from 'vue'
import { DockviewVue, type DockviewReadyEvent, themeDark, themeLight } from 'dockview-vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

const currentTheme = computed(() => (ui.theme === 'light' ? themeLight : themeDark))

const LAYOUT_KEY = 'te-long-command-layout'

type DockviewApi = DockviewReadyEvent['api']
const apiRef = ref<DockviewApi | null>(null)

// interface PanelDef {
//   id: string
//   component: string
//   title: string
// }

// const ALL_PANELS: PanelDef[] = [
//   { id: 'tree', component: 'OrderTree', title: 'Tree' },
//   { id: 'chart', component: 'ChartPanel', title: 'Chart' },
//   { id: 'entries', component: 'EntriesPanel', title: 'Entries' },
// ]

function buildDefaultLayout(event: DockviewReadyEvent) {
  try {
    event.api.addPanel({
      id: 'chart',
      component: 'ChartPanel',
      title: 'Chart',
    })
    event.api.addPanel({
      id: 'entries',
      component: 'DeviceDetailsPanel',
      title: 'Device Details',
      position: { referencePanel: 'chart', direction: 'below' },
    })
    // event.api.addPanel({
    //   id: 'tree',
    //   component: 'OrderTree',
    //   title: 'Devices',
    //   position: { referencePanel: 'entries', direction: 'below' },
    // })
  } catch (e) {
    console.error('[Dockview Layout Error]', e)
  }
}

function saveLayout() {
  if (!apiRef.value) return
  try {
    const layout = apiRef.value.toJSON()
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch (e) {
    console.error('[Dockview Persist Error]', e)
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

function onReady(event: DockviewReadyEvent) {
  apiRef.value = event.api
  event.api.onDidLayoutChange(() => {
    saveLayout()
  })
  if (!loadSavedLayout(event)) {
    buildDefaultLayout(event)
  }
}

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
</script>
