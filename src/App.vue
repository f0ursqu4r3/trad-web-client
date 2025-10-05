<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter, RouterView } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'

import AuthenticatedLayout from '@/layouts/Authenticated.vue'

import { useWsStore } from '@/stores/ws'

const { isAuthenticated } = useAuth0()
const router = useRouter()
const ws = useWsStore()

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
      return null
  }
})

watch(
  () => isAuthenticated.value,
  (isAuth) => {
    if (!isAuth) {
      router.push({ path: '/login' })
    }
  },
  { immediate: true },
)

onMounted(() => {
  ws.connect()
})

onBeforeUnmount(() => {
  ws.disconnect()
})
</script>

<template>
  <div class="app-root">
    <component v-if="layoutComponent" :is="layoutComponent">
      <RouterView />
    </component>
    <RouterView v-else />
  </div>
</template>

<style scoped>
.app-root {
  height: 100vh;
}
</style>
