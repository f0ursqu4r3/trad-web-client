// e2e only: the selected account's live projection and its resume point,
// so specs can compare a resumed tab with one that took a fresh snapshot
// (e2e/account-resume.spec.ts).

import type { useAccountProjectionStore } from '@/stores/accountProjection'

type ProjectionStore = ReturnType<typeof useAccountProjectionStore>

export function installProjectionProbe(projections: ProjectionStore): void {
  ;(window as unknown as { __tradProjectionProbe: () => unknown }).__tradProjectionProbe = () => {
    const selected = projections.selected
    if (selected === null || selected.view === null) return null
    return JSON.parse(
      JSON.stringify({
        status: selected.status,
        streamId: selected.streamId,
        live: selected.view.live,
      }),
    )
  }
}
