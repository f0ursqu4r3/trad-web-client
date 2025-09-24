<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AuthenticatedLayout from '@/layouts/AuthenticatedLayout.vue'

// Simple Nuxt-like layout selection using route meta
const route = useRoute()
const layoutComponent = computed(() => {
  const name = (route.meta.layout as string) || 'default'
  switch (name) {
    case 'authenticated':
      return AuthenticatedLayout
    case 'blank':
    case 'default':
    default:
      return 'div'
  }
})
</script>

<template>
  <div class="app-root">
    <component :is="layoutComponent">
      <RouterView />
    </component>
  </div>
</template>

<style scoped>
.app-root {
  height: 100vh;
}
</style>
