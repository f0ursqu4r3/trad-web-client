<script setup lang="ts">
import { DockviewVue, type DockviewReadyEvent, themeDark, themeLight } from 'dockview-vue'
import { createApp, h, type Component, ref, onBeforeUnmount, computed, onMounted } from 'vue'
import { SunIcon, MoonIcon, LogoutIcon } from '@/components/icons'

import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

const LAYOUT_KEY = 'terminalLayoutV1'
type DockviewApi = DockviewReadyEvent['api']
const apiRef = ref<DockviewApi | null>(null)
let saveInterval: number | null = null

const ui = useUiStore()
const auth = useAuthStore()
const currentTheme = computed(() => (ui.theme === 'dark' ? themeDark : themeLight))
// Choose which icon component to render based on current ui.theme
const themeIcon = computed(() => (ui.theme === 'dark' ? SunIcon : MoonIcon))
const themeToggleLabel = computed(() =>
  ui.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
)

interface PanelDef {
  id: string
  component: string
  title: string
}

// List of all panels that can exist in the terminal layout
const ALL_PANELS: PanelDef[] = [
  { id: 'log', component: 'LogPanel', title: 'Log' },
  { id: 'tree', component: 'OrderTree', title: 'Tree' },
  { id: 'chart', component: 'ChartPanel', title: 'Chart' },
  { id: 'details', component: 'DeviceDetails', title: 'Details' },
  { id: 'entries', component: 'EntriesPanel', title: 'Entries' },
  { id: 'inbound', component: 'InboundDebug', title: 'Inbound' },
  { id: 'cmd', component: 'CommandInput', title: 'Command' },
]

const panelMenuOpen = ref(false)
// reactive list of open panel ids so that computed missingPanels updates when user closes/adds panels
const openPanelIds = ref<string[]>([])
let layoutDisposer: (() => void) | null = null

function togglePanelMenu() {
  panelMenuOpen.value = !panelMenuOpen.value
}

function closePanelMenu() {
  panelMenuOpen.value = false
}

interface InternalPanelLike {
  id: string
}
interface InternalApiLike {
  panels?: unknown
  toJSON?: () => { panels?: { id: string }[] } | unknown
}

function extractIdsFromPanelsContainer(container: unknown): string[] {
  const ids: string[] = []
  if (!container) return ids
  if (Array.isArray(container)) {
    for (const p of container) {
      if (p && typeof p === 'object' && 'id' in p) ids.push((p as InternalPanelLike).id)
    }
    return ids
  }
  if (typeof container === 'object') {
    // Map-like structure detection without using any
    const mapCandidate = container as { values?: () => Iterable<unknown> }
    if (typeof mapCandidate.values === 'function') {
      try {
        for (const p of mapCandidate.values()) {
          if (p && typeof p === 'object' && 'id' in p) ids.push((p as InternalPanelLike).id)
        }
        return ids
      } catch {
        /* ignore */
      }
    }
    for (const p of Object.values(container as Record<string, unknown>)) {
      if (p && typeof p === 'object' && 'id' in p) ids.push((p as InternalPanelLike).id)
    }
  }
  return ids
}

function safeGetOpenPanelIds(): string[] {
  if (!apiRef.value) return []
  const api = apiRef.value as unknown as InternalApiLike
  try {
    const direct = extractIdsFromPanelsContainer(api.panels)
    if (direct.length) return direct
    if (api.toJSON) {
      const json = api.toJSON() as unknown
      if (
        json &&
        typeof json === 'object' &&
        'panels' in json &&
        Array.isArray((json as { panels?: unknown }).panels)
      ) {
        return extractIdsFromPanelsContainer((json as { panels: unknown }).panels)
      }
    }
  } catch (e) {
    console.warn('[safeGetOpenPanelIds] failed', e)
  }
  return []
}

function updateOpenPanelIds() {
  openPanelIds.value = safeGetOpenPanelIds()
}

const missingPanels = computed(() => ALL_PANELS.filter((p) => !openPanelIds.value.includes(p.id)))

function addPanelById(id: string) {
  if (!apiRef.value) return
  const def = ALL_PANELS.find((p) => p.id === id)
  if (!def) return
  try {
    apiRef.value.addPanel({ id: def.id, component: def.component, title: def.title })
    // schedule update after next tick to allow dockview internal state to settle
    requestAnimationFrame(updateOpenPanelIds)
  } catch (e) {
    console.warn('[addPanelById] failed', e)
  } finally {
    // Close menu after adding
    closePanelMenu()
  }
}

// Close the panel menu if the user clicks outside of it
function onGlobalClick(ev: MouseEvent) {
  if (!panelMenuOpen.value) return
  const target = ev.target as HTMLElement
  if (!target.closest('.add-pane-wrapper')) {
    closePanelMenu()
  }
}
onMounted(() => {
  document.addEventListener('click', onGlobalClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick)
})

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
      id: 'inbound',
      component: 'InboundDebug',
      title: 'Inbound',
      position: { referencePanel: 'log', direction: 'right' },
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

function bindLayoutListeners(api: unknown) {
  const disposers: Array<() => void> = []
  const candidate = api as Record<string, unknown>
  const register = (name: string) => {
    const maybe = candidate[name]
    if (maybe && typeof maybe === 'function') {
      try {
        const disposable = (maybe as (cb: () => void) => { dispose?: () => void } | void)(() => {
          updateOpenPanelIds()
        })
        if (disposable && typeof disposable === 'object' && 'dispose' in disposable) {
          disposers.push(() => (disposable as { dispose: () => void }).dispose())
        }
      } catch {
        /* ignore */
      }
    }
  }
  ;['onDidAddPanel', 'onDidRemovePanel', 'onDidLayoutChange'].forEach(register)
  return () => disposers.forEach((d) => d())
}

function onReady(event: DockviewReadyEvent) {
  apiRef.value = event.api
  const restored = loadSavedLayout(event)
  if (!restored) buildDefaultLayout(event)
  // initialize open panels list
  updateOpenPanelIds()
  // bind layout events (best effort)
  layoutDisposer = bindLayoutListeners(event.api)
  saveInterval = window.setInterval(persistLayout, 3000)
  window.addEventListener('beforeunload', persistLayout)
}

onBeforeUnmount(() => {
  if (saveInterval) window.clearInterval(saveInterval)
  window.removeEventListener('beforeunload', persistLayout)
  if (layoutDisposer) layoutDisposer()
})
</script>

<template>
  <div class="terminal-view">
    <div class="toolbar-row">
      <div class="toolbar-section mr-auto">
        <button class="icon-btn" @click="auth.logout" title="Logout" aria-label="Logout">
          <LogoutIcon />
        </button>
        <span>Trading Terminal</span>
      </div>

      <div class="toolbar-section">
        <div v-if="missingPanels.length" class="menu-anchor">
          <button class="btn-secondary btn-sm" @click.stop="togglePanelMenu" title="Add a panel">
            + Panel
          </button>
          <div
            v-if="panelMenuOpen && missingPanels.length"
            class="menu-dropdown"
            role="menu"
            aria-label="Add Panel Menu"
          >
            <div
              v-for="p in missingPanels"
              :key="p.id"
              class="menu-item"
              role="menuitem"
              @click.stop="addPanelById(p.id)"
            >
              {{ p.title }}
            </div>
            <div v-if="!missingPanels.length" class="menu-empty">No panels available</div>
          </div>
        </div>

        <WsIndicator />
        <button
          @click="ui.toggleTheme()"
          class="icon-btn"
          :aria-label="themeToggleLabel"
          :title="themeToggleLabel"
        >
          <component :is="themeIcon" :size="16" />
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
          InboundDebug: mountComponent('TerminalInboundDebug'),
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

/* toolbar layout now handled by shared Tailwind classes (toolbar-row, toolbar-section) */

/* dropdown now uses shared menu classes (menu-anchor, menu-dropdown, menu-item, menu-empty) */

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

/* ws indicator now provided by WsIndicator component */

/* theme toggle now uses shared icon-btn */
</style>
