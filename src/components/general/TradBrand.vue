<script setup lang="ts">
import { resolveEnvironmentBranding } from '@/lib/environmentBranding'

const brand = resolveEnvironmentBranding(window.location.hostname)
</script>

<template>
  <RouterLink class="trad-brand" to="/terminal" aria-label="Trad terminal">
    <img :src="brand.appIconPath" alt="" />
    <span>TRAD</span>
  </RouterLink>
</template>

<style scoped>
.trad-brand {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
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
@media (max-width: 720px) {
  .trad-brand span {
    display: none;
  }
}
</style>
