// The full patch notes. Only the Updates view imports this module, so the
// notes ship in its lazy chunk; the always-loaded code reads the current
// release from @/lib/releases.
import releases from '@/content/releases.json' with { type: 'json' }

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
