<script setup lang="ts">
import { resolveEnvironmentBranding } from '@/lib/environmentBranding'
import { currentProductRelease, releasePath } from '@/lib/releases'

const brand = resolveEnvironmentBranding(window.location.hostname)
const release = currentProductRelease()
</script>

<template>
  <div class="trad-identity">
    <RouterLink class="trad-brand" to="/terminal" aria-label="Trad terminal">
      <img :src="brand.appIconPath" alt="" />
      <span>TRAD</span>
    </RouterLink>
    <RouterLink
      class="trad-version"
      :to="releasePath(release.version)"
      :title="`Open Trad ${release.version} patch notes`"
    >
      v{{ release.version }}<span v-if="release.status === 'draft'">-dev</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.trad-identity,
.trad-brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.trad-identity {
  min-height: 36px;
  gap: 0.45rem;
}
.trad-brand {
  gap: 0.5rem;
  color: var(--fg-strong);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.trad-brand img {
  width: 22px;
  height: 22px;
}
.trad-version {
  padding: 0.1rem 0.3rem;
  border-left: 1px solid var(--border-normal);
  color: var(--fg-muted);
  font-size: 9px;
  letter-spacing: 0.04em;
}
.trad-version:hover {
  color: var(--accent-color);
}
@media (max-width: 720px) {
  .trad-brand span {
    display: none;
  }
  .trad-identity {
    gap: 0.25rem;
  }
}
</style>
