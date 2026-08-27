import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

import type { TelemetryConnectionState } from './catalog.ts'
import type { TelemetryRecord } from './contract.ts'
import { TelemetryCollector } from './collector.ts'

const collector = new TelemetryCollector()
let installed = false

export async function startTelemetry(router: Router): Promise<void> {
  if (installed) return
  installed = true
  await collector.start()

  recordRoute(router.currentRoute.value)

  router.afterEach((to) => {
    recordRoute(to)
    const section = typeof to.params.section === 'string' ? to.params.section : null
    if (to.path.startsWith('/settings') && section) {
      recordTelemetry({
        eventName: 'settings_section_selected',
        properties: { section_id: section },
      })
    }
    if (to.path.startsWith('/admin') && section) {
      recordTelemetry({ eventName: 'admin_section_selected', properties: { section_id: section } })
    }
    if (to.path.startsWith('/updates')) recordTelemetry({ eventName: 'release_notes_opened' })
  })

  document.addEventListener('visibilitychange', () => {
    recordTelemetry({
      eventName: 'visibility_changed',
      properties: { visibility_state: document.visibilityState },
    })
  })
  window.addEventListener('online', () => setTelemetryConnectionState('reconnecting'))
  window.addEventListener('offline', () => setTelemetryConnectionState('offline'))
  window.addEventListener('pagehide', () => collector.stop(), { once: true })
}

function recordRoute(to: RouteLocationNormalizedLoaded): void {
  const matched = to.matched[to.matched.length - 1]
  recordTelemetry({
    eventName: 'route_viewed',
    properties: { route_template: routeTemplate(matched?.path ?? to.path) },
  })
}

export function recordTelemetry(record: TelemetryRecord): void {
  try {
    queueMicrotask(() => collector.record(record))
  } catch {
    // Observation cannot escape into the product action that emitted it.
  }
}

export function setTelemetryConnectionState(state: TelemetryConnectionState): void {
  collector.setConnectionState(state)
}

export function newActionAttemptId(): string {
  return crypto.randomUUID()
}

function routeTemplate(path: string): string {
  return path
    .replace(/:([A-Za-z][A-Za-z0-9_]*)\([^)]*\)/g, '{$1}')
    .replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}')
}

export type {
  TelemetryActionKind,
  TelemetryBlockerCode,
  TelemetryConnectionState,
  TelemetryEventName,
} from './catalog.ts'
