import releases from '@/content/releases.json'

export type ReleaseCategory = 'major' | 'minor' | 'fixes'

export interface ReleaseDetailGroup {
  category: ReleaseCategory
  title: string
  items: string[]
}

export interface ProductRelease {
  version: string
  status: 'draft' | 'published'
  released_at: string | null
  channel: string
  summary: string
  major: string[]
  minor: string[]
  fixes: string[]
  details: ReleaseDetailGroup[]
}

export const productReleases = releases as ProductRelease[]

export function visibleProductReleases(development = import.meta.env.DEV): ProductRelease[] {
  return productReleases.filter((release) => release.status === 'published' || development)
}

export function currentProductRelease(development = import.meta.env.DEV): ProductRelease {
  return visibleProductReleases(development)[0] ?? productReleases[0]
}

export function releasePath(version: string): string {
  return `/updates/${version}/`
}

export function isProductionReleaseHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'trad.lol' || normalized === 'www.trad.lol'
}

export function releasePreviewPath(version: string, hostname = ''): string {
  const directory = isProductionReleaseHost(hostname)
    ? '/prod-update-previews'
    : '/update-previews'
  return `${directory}/${version}.png`
}

export function updatesPreviewPath(currentVersion: string, hostname = ''): string {
  return isProductionReleaseHost(hostname)
    ? releasePreviewPath(currentVersion, hostname)
    : '/test-brand/social-preview.png'
}
