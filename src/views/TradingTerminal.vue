<script setup lang="ts">
import { DockviewVue, type DockviewReadyEvent } from 'dockview-vue'
import { createApp, type Component } from 'vue'

import TerminalLogPanel from '@/components/terminal/TerminalLogPanel.vue'
import TerminalChartPanel from '@/components/terminal/TerminalChartPanel.vue'
import TerminalOrderTree from '@/components/terminal/TerminalOrderTree.vue'
import TerminalEntriesPanel from '@/components/terminal/TerminalEntriesPanel.vue'
import TerminalCommandInput from '@/components/terminal/TerminalCommandInput.vue'
import TerminalDeviceDetails from '@/components/terminal/TerminalDeviceDetails.vue'

const componentMap: Record<string, Component> = {
  Log: TerminalLogPanel,
  Chart: TerminalChartPanel,
  OrderTree: TerminalOrderTree,
  Entries: TerminalEntriesPanel,
  DeviceDetails: TerminalDeviceDetails,
  Command: TerminalCommandInput,
}

function createComponent(options: { id: string; name: string }) {
  const Comp = componentMap[options.name]
  const container = document.createElement('div')
  let app: ReturnType<typeof createApp> | null = null
  if (Comp) {
    app = createApp(Comp)
    app.mount(container)
  } else {
    container.textContent = `Missing component: ${options.name}`
    container.style.padding = '8px'
  }
  return {
    element: container,
    update() {},
    dispose() {
      if (app) app.unmount()
    },
  }
}

function onReady(event: DockviewReadyEvent) {
  try {
    event.api.addPanel({ id: 'log', component: 'Log', title: 'Log' })
    event.api.addPanel({
      id: 'tree',
      component: 'OrderTree',
      title: 'Tree',
      position: { referencePanel: 'log', direction: 'below' },
    })
    event.api.addPanel({
      id: 'chart',
      component: 'Chart',
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
      component: 'Entries',
      title: 'Entries',
      position: { referencePanel: 'chart', direction: 'below' },
    })
    event.api.addPanel({
      id: 'cmd',
      component: 'Command',
      title: 'Command',
      position: { referencePanel: 'entries', direction: 'within' },
    })
  } catch (e) {
    console.error('[Dockview Layout Error]', e)
  }
}
</script>

<template>
  <div class="dockview-wrapper dockview-theme-trad">
    <DockviewVue :createComponent="createComponent" class="dv-instance" @ready="onReady" />
  </div>
</template>

<style scoped>
.dockview-wrapper {
  position: absolute;
  inset: 0;
  padding: 4px;
  box-sizing: border-box;
}
.dv-instance {
  width: 100%;
  height: 100%;
}
</style>
