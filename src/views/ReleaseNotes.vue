<script setup lang="ts">
import { computed, ref } from 'vue'
import { useHead } from '@unhead/vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, Bug, Check, CircleDot, Link, Rocket, Sparkles } from 'lucide-vue-next'
import ControlPageHeader from '@/components/control/ControlPageHeader.vue'
import {
  currentProductRelease,
  releasePath,
  releasePreviewPath,
  updatesPreviewPath,
  visibleProductReleases,
  type ProductRelease,
  type ReleaseCategory,
} from '@/lib/releases'

type Category = 'all' | 'major' | 'minor' | 'fixes'
type ChangeCategory = ReleaseCategory

const route = useRoute()
const activeCategory = ref<Category>('all')
const copiedVersion = ref<string | null>(null)
const categories: Array<{ key: Category; label: string }> = [
  { key: 'all', label: 'All changes' },
  { key: 'major', label: 'Major' },
  { key: 'minor', label: 'Minor' },
  { key: 'fixes', label: 'Fixes' },
]
const sections = [
  { key: 'major' as const, label: 'Major', icon: Rocket },
  { key: 'minor' as const, label: 'Minor', icon: Sparkles },
  { key: 'fixes' as const, label: 'Fixes', icon: Bug },
]
const visibleReleases = computed(() => visibleProductReleases())
const selectedVersion = computed(() => String(route.params.version ?? '').trim())
const selectedRelease = computed(() =>
  selectedVersion.value
    ? (visibleReleases.value.find((release) => release.version === selectedVersion.value) ?? null)
    : null,
)
const displayedReleases = computed(() =>
  selectedVersion.value
    ? selectedRelease.value
      ? [selectedRelease.value]
      : []
    : visibleReleases.value,
)
const currentRelease = currentProductRelease()
const currentBuild = computed(
  () =>
    import.meta.env.VITE_APP_BUILD?.trim() ||
    `${currentRelease.version}${currentRelease.status === 'draft' ? '-dev' : ''}`,
)

useHead(
  computed(() => {
    const release = selectedRelease.value
    const title = release ? `Trad ${release.version} — Patch notes` : 'Trad updates — Patch notes'
    const description = release?.summary ?? 'Detailed Trad releases, improvements, and fixes.'
    const canonicalPath = release ? releasePath(release.version) : '/updates/'
    const canonical = new URL(canonicalPath, window.location.origin).href
    const previewVersion = release?.version ?? currentRelease.version
    const image = new URL(
      release
        ? releasePreviewPath(previewVersion, window.location.hostname)
        : updatesPreviewPath(previewVersion, window.location.hostname),
      window.location.origin,
    ).href
    return {
      title,
      link: [{ rel: 'canonical', href: canonical }],
      meta: [
        { name: 'description', content: description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: canonical },
        { property: 'og:image', content: image },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
    }
  }),
)

function showSection(key: ChangeCategory): boolean {
  return activeCategory.value === 'all' || activeCategory.value === key
}

function detailCount(release: ProductRelease): number {
  return release.details
    .filter((group) => showSection(group.category))
    .reduce((total, group) => total + group.items.length, 0)
}

async function copyReleaseLink(release: ProductRelease): Promise<void> {
  const value = new URL(releasePath(release.version), window.location.origin).href
  await navigator.clipboard.writeText(value)
  copiedVersion.value = release.version
  window.setTimeout(() => {
    if (copiedVersion.value === release.version) copiedVersion.value = null
  }, 1800)
}

function formatReleaseDate(value: string | null): string {
  if (value === null) return 'Unreleased'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}
</script>

<template>
  <ControlPageHeader
    eyebrow="Product"
    title="Patch notes"
    description="Major features, smaller improvements, and fixes published with each deployed Trad version."
  />

  <RouterLink v-if="selectedRelease" class="all-releases-link" to="/updates">
    <ArrowLeft :size="13" /> All updates
  </RouterLink>

  <div class="release-toolbar" aria-label="Patch note filters">
    <div class="release-filters">
      <button
        v-for="category in categories"
        :key="category.key"
        type="button"
        :class="{ active: activeCategory === category.key }"
        @click="activeCategory = category.key"
      >
        {{ category.label }}
      </button>
    </div>
    <div class="build-identity">
      <span>Current build</span><code>{{ currentBuild }}</code>
    </div>
  </div>

  <div class="release-list">
    <div v-if="selectedVersion && !selectedRelease" class="release-not-found">
      <strong>Update not found</strong>
      <span>Trad {{ selectedVersion }} is not published in this environment.</span>
      <RouterLink to="/updates">View all updates</RouterLink>
    </div>
    <article
      v-for="(release, releaseIndex) in displayedReleases"
      :key="release.version"
      :id="`release-${release.version}`"
      class="release-card"
    >
      <div class="release-rail" aria-hidden="true">
        <CircleDot :size="16" />
      </div>
      <header class="release-header">
        <div>
          <div class="release-title-line">
            <h2>
              <RouterLink :to="releasePath(release.version)">Trad {{ release.version }}</RouterLink>
            </h2>
            <span
              class="release-state"
              :class="release.status === 'draft' ? 'draft' : 'published'"
              >{{ release.status === 'draft' ? 'draft preview' : release.channel }}</span
            >
            <button
              class="copy-release-link"
              type="button"
              :title="`Copy link to Trad ${release.version}`"
              :aria-label="`Copy link to Trad ${release.version}`"
              @click="copyReleaseLink(release)"
            >
              <Check v-if="copiedVersion === release.version" :size="13" />
              <Link v-else :size="13" />
              <span>{{ copiedVersion === release.version ? 'copied' : 'copy link' }}</span>
            </button>
          </div>
          <p>{{ release.summary }}</p>
        </div>
        <time :datetime="release.released_at || undefined">{{
          formatReleaseDate(release.released_at)
        }}</time>
      </header>

      <div class="release-sections" :class="{ filtered: activeCategory !== 'all' }">
        <template v-for="section in sections" :key="section.key">
          <section v-if="showSection(section.key)" class="release-section">
            <h3><component :is="section.icon" :size="14" />{{ section.label }}</h3>
            <p v-if="release[section.key].length === 0" class="release-empty">No entries.</p>
            <ul v-else>
              <li v-for="item in release[section.key]" :key="item">{{ item }}</li>
            </ul>
          </section>
        </template>
      </div>
      <details class="release-details" :open="selectedRelease !== null || releaseIndex === 0">
        <summary>
          <span>Detailed changes</span>
          <span>{{ detailCount(release) }} items</span>
        </summary>
        <div class="detail-groups">
          <template v-for="group in release.details" :key="group.title">
            <section v-if="showSection(group.category)" class="detail-group">
              <header>
                <span :class="`detail-category ${group.category}`">{{ group.category }}</span>
                <h3>{{ group.title }}</h3>
              </header>
              <ul>
                <li v-for="item in group.items" :key="item">{{ item }}</li>
              </ul>
            </section>
          </template>
        </div>
      </details>
    </article>
  </div>
</template>

<style scoped>
.release-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.55rem;
  border: 1px solid var(--border-normal);
  background: var(--surface-muted);
}
.all-releases-link {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 0.35rem;
  margin: -0.35rem 0 0.75rem;
  color: var(--accent-color);
  font-size: 12px;
}
.all-releases-link:hover {
  text-decoration: underline;
}
.release-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.release-filters button {
  min-height: 32px;
  padding: 0 0.7rem;
  border: 1px solid transparent;
  color: var(--fg-muted);
  font-size: 12px;
}
.release-filters button:hover {
  background: var(--surface-hover);
  color: var(--fg-strong);
}
.release-filters button.active {
  border-color: color-mix(in srgb, var(--accent-color) 46%, var(--border-normal));
  background: var(--surface-selected);
  color: var(--accent-color);
}
.build-identity {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--fg-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.build-identity code {
  max-width: 18rem;
  overflow: hidden;
  color: var(--fg);
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}
.release-list {
  position: relative;
  display: grid;
  gap: 1rem;
  padding-left: 1.5rem;
}
.release-not-found {
  display: grid;
  gap: 0.4rem;
  padding: 1.25rem;
  border: 1px solid var(--border-normal);
  background: var(--surface-raised);
  color: var(--fg-muted);
  font-size: 13px;
}
.release-not-found strong {
  color: var(--fg-strong);
  font-size: 15px;
}
.release-not-found a {
  width: max-content;
  color: var(--accent-color);
}
.release-list::before {
  position: absolute;
  top: 0.8rem;
  bottom: 0.8rem;
  left: 0.45rem;
  width: 1px;
  background: var(--border-normal);
  content: '';
}
.release-card {
  position: relative;
  border: 1px solid var(--border-normal);
  background: var(--surface-base);
}
.release-rail {
  position: absolute;
  top: 1.05rem;
  left: -1.55rem;
  display: grid;
  width: 1rem;
  height: 1rem;
  place-items: center;
  color: var(--accent-color);
  background: var(--surface-canvas);
}
.release-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-muted);
}
.release-title-line {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.release-title-line h2 {
  margin: 0;
  color: var(--fg-strong);
  font-size: 16px;
  font-weight: 600;
}
.release-title-line h2 a:hover {
  color: var(--accent-color);
}
.copy-release-link {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  gap: 0.3rem;
  padding: 0 0.45rem;
  border: 1px solid transparent;
  color: var(--fg-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.copy-release-link:hover,
.copy-release-link:focus-visible {
  border-color: var(--border-normal);
  background: var(--surface-hover);
  color: var(--accent-color);
}
.release-header p {
  max-width: 52rem;
  margin: 0.3rem 0 0;
  color: var(--fg-muted);
  font-size: 13px;
}
.release-header time {
  flex: none;
  color: var(--fg-muted);
  font-size: 12px;
}
.release-state {
  padding: 0.12rem 0.4rem;
  border: 1px solid var(--border-normal);
  color: var(--fg-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.release-state.draft {
  border-color: color-mix(in srgb, var(--state-warning) 48%, var(--border-normal));
  color: var(--state-warning);
}
.release-state.published {
  border-color: color-mix(in srgb, var(--state-success) 38%, var(--border-normal));
  color: var(--state-success);
}
.release-sections {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.release-sections.filtered {
  grid-template-columns: 1fr;
}
.release-section {
  min-width: 0;
  padding: 1rem 1.1rem;
  border-right: 1px solid var(--border-subtle);
}
.release-section:last-child {
  border-right: 0;
}
.release-section h3 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.65rem;
  color: var(--fg-strong);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.09em;
}
.release-section ul {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.release-section li {
  position: relative;
  padding-left: 0.85rem;
  color: var(--fg);
  font-size: 13px;
  line-height: 1.5;
}
.release-section li::before {
  position: absolute;
  top: 0.6em;
  left: 0;
  width: 4px;
  height: 4px;
  background: var(--accent-color);
  content: '';
}
.release-empty {
  margin: 0;
  color: var(--fg-muted);
}
.release-details {
  border-top: 1px solid var(--border-normal);
  background: var(--surface-raised);
}
.release-details > summary {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 1.1rem;
  color: var(--fg-strong);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.release-details > summary:hover {
  background: var(--surface-hover);
}
.release-details > summary span:last-child {
  color: var(--fg-muted);
  font-size: 10px;
  font-weight: 400;
}
.detail-groups {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--border-subtle);
}
.detail-group {
  padding: 1rem 1.1rem 1.1rem;
  border-bottom: 1px solid var(--border-subtle);
}
.detail-group:last-child {
  border-bottom: 0;
}
.detail-group header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.65rem;
}
.detail-group h3 {
  margin: 0;
  color: var(--fg-strong);
  font-size: 13px;
  font-weight: 600;
}
.detail-category {
  min-width: 3.7rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--border-normal);
  color: var(--fg-muted);
  font-size: 9px;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.detail-category.major {
  border-color: color-mix(in srgb, var(--accent-color) 42%, var(--border-normal));
  color: var(--accent-color);
}
.detail-category.minor {
  border-color: color-mix(in srgb, var(--state-success) 36%, var(--border-normal));
  color: var(--state-success);
}
.detail-category.fixes {
  border-color: color-mix(in srgb, var(--state-warning) 42%, var(--border-normal));
  color: var(--state-warning);
}
.detail-group ul {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding: 0 0 0 1.1rem;
}
.detail-group li {
  padding-left: 0.25rem;
  color: var(--fg);
  font-size: 12px;
  line-height: 1.55;
}
@media (max-width: 900px) {
  .release-sections {
    grid-template-columns: 1fr;
  }
  .release-section {
    border-right: 0;
    border-bottom: 1px solid var(--border-subtle);
  }
  .release-section:last-child {
    border-bottom: 0;
  }
}
@media (max-width: 620px) {
  .release-toolbar,
  .release-header {
    align-items: stretch;
    flex-direction: column;
  }
  .build-identity {
    justify-content: space-between;
  }
  .release-list {
    padding-left: 0;
  }
  .release-list::before,
  .release-rail {
    display: none;
  }
}
</style>
