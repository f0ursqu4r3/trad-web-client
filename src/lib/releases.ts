// The current release, without the notes: vite.config.ts compiles it in from
// src/content/releases.json, so it cannot drift from them. The full notes are
// in @/lib/releaseNotes, loaded with the Updates view.
export interface CurrentProductRelease {
  version: string
  status: 'draft' | 'published'
}

declare const __TRAD_CURRENT_RELEASES__: {
  development: CurrentProductRelease
  published: CurrentProductRelease
}

// The newest visible release: development shows drafts, a build does not.
export function currentProductRelease(development = import.meta.env.DEV): CurrentProductRelease {
  return development ? __TRAD_CURRENT_RELEASES__.development : __TRAD_CURRENT_RELEASES__.published
}

export function releasePath(version: string): string {
  return `/updates/${version}/`
}

export function isProductionReleaseHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'trad.lol' || normalized === 'www.trad.lol'
}

export function releasePreviewPath(version: string, hostname = ''): string {
  const directory = isProductionReleaseHost(hostname) ? '/prod-update-previews' : '/update-previews'
  return `${directory}/${version}.png`
}

export function updatesPreviewPath(currentVersion: string, hostname = ''): string {
  return isProductionReleaseHost(hostname)
    ? releasePreviewPath(currentVersion, hostname)
    : '/test-brand/social-preview.png'
}
