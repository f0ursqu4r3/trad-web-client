<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ShieldCheck, SlidersHorizontal, SquareTerminal } from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const user = useUserStore()
const activeArea = computed(() => {
  if (route.path.startsWith('/admin')) return 'admin'
  if (route.path.startsWith('/settings')) return 'settings'
  return 'terminal'
})
</script>

<template>
  <nav class="product-area-nav" aria-label="Trad areas">
    <RouterLink to="/terminal" :class="{ active: activeArea === 'terminal' }">
      <SquareTerminal :size="13" /> <span>Terminal</span>
    </RouterLink>
    <RouterLink to="/settings/profile" :class="{ active: activeArea === 'settings' }">
      <SlidersHorizontal :size="13" /> <span>Settings</span>
    </RouterLink>
    <RouterLink
      v-if="user.isAdmin"
      to="/admin/operations"
      :class="{ active: activeArea === 'admin' }"
    >
      <ShieldCheck :size="13" /> <span>Admin</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.product-area-nav {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.2rem;
}
.product-area-nav a {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.65rem;
  border: 1px solid transparent;
  color: var(--fg-muted);
  font-size: 12px;
}
.product-area-nav a:hover {
  background: var(--surface-hover);
  color: var(--fg-strong);
}
.product-area-nav a.active {
  border-color: color-mix(in srgb, var(--accent-color) 28%, var(--border-normal));
  background: var(--surface-selected);
  color: var(--accent-color);
}
@media (max-width: 720px) {
  .product-area-nav a span {
    display: none;
  }
}
</style>
