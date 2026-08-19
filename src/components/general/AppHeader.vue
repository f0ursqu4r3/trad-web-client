<script setup lang="ts">
import { ref } from 'vue'
import ProductAreaNav from './ProductAreaNav.vue'
import AccountSelect from './AccountSelect.vue'
import TradBrand from './TradBrand.vue'
import UserAccountMenu from './UserAccountMenu.vue'
import WsIndicator from './WsIndicator.vue'

withDefaults(defineProps<{ showConnection?: boolean; showAccountSelector?: boolean }>(), {
  showConnection: false,
  showAccountSelector: false,
})

const accountSelect = ref<InstanceType<typeof AccountSelect> | null>(null)

function openAccountSelector(): void {
  accountSelect.value?.open()
}

defineExpose({ openAccountSelector })
</script>

<template>
  <header class="app-header">
    <div class="app-header-left">
      <ProductAreaNav />
      <AccountSelect v-if="showAccountSelector" ref="accountSelect" class="header-account-select" />
    </div>
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
.app-header-left {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}
.header-account-select {
  padding-left: 0.75rem;
  border-left: 1px solid var(--border-normal);
}
</style>
