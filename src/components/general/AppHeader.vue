<script setup lang="ts">
import ProductAreaNav from './ProductAreaNav.vue'
import TradBrand from './TradBrand.vue'
import UserAccountMenu from './UserAccountMenu.vue'
import WsIndicator from './WsIndicator.vue'

withDefaults(defineProps<{ showConnection?: boolean }>(), { showConnection: false })
</script>

<template>
  <header class="app-header">
    <ProductAreaNav />
    <TradBrand />
    <div class="app-header-status">
      <WsIndicator v-if="showConnection" />
      <UserAccountMenu />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: grid;
  min-height: 46px;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.75rem;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-muted);
}
.app-header-status {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-self: end;
  gap: 0.7rem;
}
</style>
