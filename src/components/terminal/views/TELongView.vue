<template>
  <div class="dockview-wrapper dockview-theme-trad">
    <DockviewVue
      class="dv-instance"
      @ready="onReady"
      :theme="currentTheme"
      single-tab-mode="fullwidth"
      :components="{
        ChartPanel: mountComponent('ChartPanel'),
        OrderTree: mountComponent('OrderTree'),
        EntriesPanel: mountComponent('EntriesPanel'),
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { createApp, h, type Component, ref, computed } from 'vue'
import { DockviewVue, type DockviewReadyEvent, themeDark, themeLight } from 'dockview-vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const currentTheme = computed(() => (ui.theme === 'dark' ? themeDark : themeLight))

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
      id: 'tree',
      component: 'OrderTree',
      title: 'Tree',
      position: { referencePanel: 'chart', direction: 'below' },
    })
    event.api.addPanel({
      id: 'entries',
      component: 'EntriesPanel',
      title: 'Entries',
      position: { referencePanel: 'chart', direction: 'below' },
    })
  } catch (e) {
    console.error('[Dockview Layout Error]', e)
  }
}

function onReady(event: DockviewReadyEvent) {
  apiRef.value = event.api
  buildDefaultLayout(event)
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

<style scoped>
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
