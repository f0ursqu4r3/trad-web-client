<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Menu, ShieldCheck, SlidersHorizontal, SquareTerminal, X } from 'lucide-vue-next'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const user = useUserStore()
const mobileOpen = ref(false)
const activeArea = computed(() => {
  if (route.path.startsWith('/admin')) return 'admin'
  if (route.path.startsWith('/settings')) return 'settings'
  return 'terminal'
})

watch(
  () => route.fullPath,
  () => (mobileOpen.value = false),
)
</script>

<template>
  <nav class="product-area-nav" aria-label="Trad areas">
    <button
      class="mobile-nav-toggle"
      type="button"
      :aria-expanded="mobileOpen"
      aria-label="Open navigation"
      @click="mobileOpen = !mobileOpen"
    >
      <X v-if="mobileOpen" :size="18" /><Menu v-else :size="18" />
    </button>
    <div class="product-area-links" :class="{ open: mobileOpen }">
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
    </div>
  </nav>
</template>

<style scoped>
.product-area-nav {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.2rem;
}
.product-area-links {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.product-area-links a {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.65rem;
  border: 1px solid transparent;
  color: var(--fg-muted);
  font-size: 12px;
}
.product-area-links a:hover {
  background: var(--surface-hover);
  color: var(--fg-strong);
}
.product-area-links a.active {
  border-color: color-mix(in srgb, var(--accent-color) 28%, var(--border-normal));
  background: var(--surface-selected);
  color: var(--accent-color);
}
.mobile-nav-toggle {
  display: none;
  min-width: 36px;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-normal);
  background: var(--surface-base);
  color: var(--fg-strong);
}
@media (max-width: 720px) {
  .mobile-nav-toggle {
    display: inline-flex;
  }
  .product-area-links {
    position: fixed;
    z-index: 60;
    top: 46px;
    left: 0.5rem;
    display: none;
    min-width: 190px;
    flex-direction: column;
    align-items: stretch;
    padding: 0.4rem;
    border: 1px solid var(--border-normal);
    background: var(--surface-muted);
    box-shadow: 0 12px 30px rgb(0 0 0 / 35%);
  }
  .product-area-links.open {
    display: flex;
  }
  .product-area-links a {
    min-height: 42px;
  }
}
</style>
