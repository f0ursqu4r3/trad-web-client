<!-- Chrome for public pages (the engineering reports), used by the view
     itself rather than through route meta, so it loads with the page. -->
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Newspaper, SquareTerminal } from 'lucide-vue-next'
import TradBrand from '@/components/general/TradBrand.vue'
</script>

<template>
  <div class="public-shell">
    <header class="public-header">
      <nav class="public-links" aria-label="Trad areas">
        <RouterLink to="/updates"><Newspaper :size="13" /><span>Updates</span></RouterLink>
      </nav>
      <TradBrand />
      <nav class="public-links end" aria-label="Terminal">
        <RouterLink to="/terminal"><SquareTerminal :size="13" /><span>Terminal</span></RouterLink>
      </nav>
    </header>
    <main class="public-main">
      <div class="public-content"><slot /></div>
    </main>
  </div>
</template>

<style scoped>
.public-shell {
  min-height: 100vh;
  background: var(--surface-canvas);
}
.public-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  min-height: 46px;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-muted);
}
.public-links {
  display: flex;
  min-width: 0;
  align-items: center;
}
.public-links.end {
  justify-content: flex-end;
}
.public-links a {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.65rem;
  border: 1px solid transparent;
  color: var(--fg-muted);
  font-size: 12px;
}
.public-links a:hover {
  background: var(--surface-hover);
  color: var(--fg-strong);
}
.public-main {
  font-size: 13px;
  line-height: 1.5;
}
.public-content {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 1.5rem;
}
@media (max-width: 760px) {
  .public-content {
    padding: 1rem;
  }
}
</style>
