import type { Page } from '@playwright/test'

// Replaces document visibility with a switch the test controls, and holds
// animation frames while "hidden" the way a background tab does.
export async function installVisibilitySwitch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let hidden = false
    const held: Array<() => void> = []
    const nativeFrame = window.requestAnimationFrame.bind(window)
    Object.defineProperty(Document.prototype, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    })
    Object.defineProperty(Document.prototype, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      if (!hidden) return nativeFrame(callback)
      held.push(() => nativeFrame(callback))
      return -1
    }
    ;(window as unknown as { __setTabHidden: (next: boolean) => void }).__setTabHidden = (
      next: boolean,
    ) => {
      hidden = next
      if (next) {
        window.dispatchEvent(new Event('blur'))
        document.dispatchEvent(new Event('visibilitychange'))
        return
      }
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      for (const release of held.splice(0)) release()
    }
  })
}

export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(
    (next) =>
      (window as unknown as { __setTabHidden: (next: boolean) => void }).__setTabHidden(next),
    hidden,
  )
}
