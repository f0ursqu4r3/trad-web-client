<template>
  <div class="w-full h-full panel">
    <DockviewVue
      class="trad-dockview w-full h-full"
      @ready="onReady"
      single-tab-mode="fullwidth"
      :components="{
        ChartPanel: mountComponent('ChartPanel'),
        DeviceDetailsPanel: mountComponent('DeviceDetailsPanel'),
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { createApp, h, type Component, ref } from 'vue'
import { DockviewVue, type DockviewReadyEvent } from 'dockview-vue'
import { createLogger } from '@/lib/utils'

const logger = createLogger('dockview')

const LAYOUT_KEY = 'trailing-entry-view-layout'

type DockviewApi = DockviewReadyEvent['api']
const apiRef = ref<DockviewApi | null>(null)

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
  } catch (e) {
    logger.error('layout error', e)
  }
}

function saveLayout() {
  if (!apiRef.value) return
  try {
    const layout = apiRef.value.toJSON()
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch (e) {
    logger.error('persist error', e)
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
    logger.warn('layout restore failed', e)
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
